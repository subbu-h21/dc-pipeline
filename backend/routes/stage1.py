import asyncio
import logging
import os
import uuid
from typing import List

import aiosqlite
import openai
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from rapidfuzz import fuzz, process

from config import PHOTOS_DIR
from database import get_db
from services.extraction import extract_dc_summary

log = logging.getLogger(__name__)
router = APIRouter()

_MIME_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

_ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
_MAX_SIZE = 20 * 1024 * 1024  # 20 MB


async def _save_photo(file: UploadFile, folder: str, photo_type: str) -> str:
    os.makedirs(folder, exist_ok=True)
    ext = _MIME_TO_EXT.get(file.content_type or "", ".jpg")
    filename = f"{photo_type}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(folder, filename)
    data = await file.read()
    with open(path, "wb") as f:
        f.write(data)
    return path


async def _match_supplier(db: aiosqlite.Connection, extracted: str) -> tuple[int | None, str]:
    """Fuzzy-map an extracted supplier string to the nearest supplier already in the DB."""
    if not extracted:
        return None, ""

    cur = await db.execute("SELECT id, name FROM suppliers")
    rows = await cur.fetchall()
    if not rows:
        return None, ""

    names = [r["name"] for r in rows]
    hit = process.extractOne(extracted.upper(), [n.upper() for n in names], scorer=fuzz.WRatio)
    if not hit or hit[1] < 55:
        return None, ""

    idx = hit[2]
    return rows[idx]["id"], rows[idx]["name"]


@router.post("/stage1/extract")
async def stage1_extract(image: UploadFile = File(...), model: str | None = Form(default=None)):
    if image.content_type not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f'Invalid file type "{image.content_type}". Allowed: JPEG, PNG, WebP, GIF.',
        )

    image_bytes = await image.read()
    if len(image_bytes) > _MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 20 MB.")

    try:
        parsed = await asyncio.to_thread(extract_dc_summary, image_bytes, image.content_type, model)
    except openai.AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid API key. Check OPENROUTER_API_KEY.")
    except openai.NotFoundError as e:
        log.error("Model not found: %s", e)
        raise HTTPException(status_code=404, detail=f"Model not found on OpenRouter. Check the model ID. ({e})")
    except openai.BadRequestError as e:
        log.error("Bad request to OpenRouter: %s", e)
        raise HTTPException(status_code=400, detail=f"Model rejected the request (tool calling may not be supported): {e}")
    except openai.RateLimitError:
        raise HTTPException(status_code=429, detail="Rate limit reached. Please retry.")
    except openai.APITimeoutError:
        raise HTTPException(status_code=504, detail="AI service timed out. Please retry.")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    raw_supplier = parsed.get("supplier_name", "")

    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        supplier_id, supplier_name = await _match_supplier(db, raw_supplier)

    return {
        "dc_number":         parsed.get("dc_number", ""),
        "item_count":        parsed.get("item_count", 0),
        "supplier_id":       supplier_id,
        "supplier_name":     supplier_name,
        "supplier_name_raw": raw_supplier,
    }


@router.post("/stage1/save")
async def stage1_save(
    dc_number: str = Form(...),
    supplier_id: int = Form(...),
    stage1_by: int = Form(...),
    invoice_date: str = Form(...),
    num_items: int = Form(...),
    photos: List[UploadFile] = File(default=[]),
    photo_types: List[str] = Form(default=[]),
):
    if len(photos) != len(photo_types):
        raise HTTPException(
            status_code=400,
            detail=f"photos count ({len(photos)}) != photo_types count ({len(photo_types)})",
        )

    folder = os.path.join(PHOTOS_DIR, f"{dc_number}_{supplier_id}")

    async with get_db() as db:
        db.row_factory = aiosqlite.Row

        cur = await db.execute(
            "SELECT id, stage1_by, stage1_done_at FROM dc_records "
            "WHERE dc_number = ? AND supplier_id = ?",
            (dc_number, supplier_id),
        )
        existing = await cur.fetchone()

        if existing:
            record_id = existing["id"]
            # Preserve stage1_by / stage1_done_at once set (same "never
            # overwrite" rule /stage2/save already applies to stage2_by) — the
            # merged workflow re-POSTs this endpoint on every save (even one
            # that's only touching remarks/verification), so re-crediting
            # whoever's currently on screen would silently steal the original
            # checker's attribution and reset the original check timestamp.
            final_stage1_by = existing["stage1_by"] if existing["stage1_by"] else stage1_by
            if existing["stage1_done_at"] is None:
                await db.execute(
                    """UPDATE dc_records
                       SET stage1_by = ?, stage1_done_at = CURRENT_TIMESTAMP,
                           invoice_date = ?, num_items = ?,
                           updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?""",
                    (final_stage1_by, invoice_date, num_items, record_id),
                )
            else:
                await db.execute(
                    """UPDATE dc_records
                       SET stage1_by = ?, invoice_date = ?, num_items = ?,
                           updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?""",
                    (final_stage1_by, invoice_date, num_items, record_id),
                )
            log.info("Updated Stage 1 for dc=%s supplier=%d", dc_number, supplier_id)
        else:
            cur = await db.execute(
                """INSERT INTO dc_records
                   (dc_number, supplier_id, status, stage1_skipped,
                    stage1_by, stage1_done_at, invoice_date, num_items)
                   VALUES (?, ?, 'stage1', 0, ?, CURRENT_TIMESTAMP, ?, ?)""",
                (dc_number, supplier_id, stage1_by, invoice_date, num_items),
            )
            record_id = cur.lastrowid
            log.info("Created Stage 1 record id=%d dc=%s", record_id, dc_number)

        for photo, photo_type in zip(photos, photo_types):
            if not photo.filename:
                continue
            path = await _save_photo(photo, folder, photo_type)
            await db.execute(
                "INSERT INTO dc_photos (dc_record_id, photo_type, file_path, uploaded_by) "
                "VALUES (?, ?, ?, ?)",
                (record_id, photo_type, path, stage1_by),
            )

        await db.commit()

    return {"id": record_id, "dc_number": dc_number, "status": "saved"}


@router.get("/stage1/{dc_number}/{supplier_id}")
async def stage1_get(dc_number: str, supplier_id: int):
    async with get_db() as db:
        db.row_factory = aiosqlite.Row

        cur = await db.execute(
            """SELECT dr.*,
                      s.name  AS supplier_name,
                      e.name  AS stage1_by_name
               FROM dc_records dr
               LEFT JOIN suppliers s ON dr.supplier_id = s.id
               LEFT JOIN employees e ON dr.stage1_by = e.id
               WHERE dr.dc_number = ? AND dr.supplier_id = ?""",
            (dc_number, supplier_id),
        )
        record = await cur.fetchone()
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")

        cur = await db.execute(
            "SELECT * FROM dc_photos WHERE dc_record_id = ? ORDER BY uploaded_at",
            (record["id"],),
        )
        photos = await cur.fetchall()

    return {
        "record": dict(record),
        "photos": [dict(p) for p in photos],
    }
