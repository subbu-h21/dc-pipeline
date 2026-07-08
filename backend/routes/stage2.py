import json
import logging
import os
from typing import List, Optional

import aiosqlite
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from config import PHOTOS_DIR
from database import get_db
from routes.stage1 import _save_photo

log = logging.getLogger(__name__)
router = APIRouter()

_VALID_REMARKS = {
    "incorrect_qty",
    "incorrect_free_qty",
    "incorrect_batch",
    "missing_product",
    "near_expiry",
}


@router.get("/stage2/list")
async def stage2_list(supplier_id: Optional[int] = Query(default=None)):
    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        if supplier_id is not None:
            cur = await db.execute(
                """SELECT dr.id, dr.dc_number, dr.supplier_id, dr.status, dr.invoice_date,
                          dr.stage1_skipped, dr.created_at,
                          s.name AS supplier_name
                   FROM dc_records dr
                   LEFT JOIN suppliers s ON dr.supplier_id = s.id
                   WHERE dr.supplier_id = ?
                   ORDER BY dr.created_at DESC""",
                (supplier_id,),
            )
        else:
            # No supplier filter — most recent 20 DCs across all suppliers.
            cur = await db.execute(
                """SELECT dr.id, dr.dc_number, dr.supplier_id, dr.status, dr.invoice_date,
                          dr.stage1_skipped, dr.created_at,
                          s.name AS supplier_name
                   FROM dc_records dr
                   LEFT JOIN suppliers s ON dr.supplier_id = s.id
                   ORDER BY dr.created_at DESC
                   LIMIT 20"""
            )
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.get("/stage2/find")
async def stage2_find(
    dc_number: str = Query(...),
    supplier_id: int = Query(...),
):
    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """SELECT dr.*,
                      s.name  AS supplier_name,
                      e1.name AS stage1_by_name,
                      e2.name AS stage2_by_name
               FROM dc_records dr
               LEFT JOIN suppliers s  ON dr.supplier_id = s.id
               LEFT JOIN employees e1 ON dr.stage1_by = e1.id
               LEFT JOIN employees e2 ON dr.stage2_by = e2.id
               WHERE dr.dc_number = ? AND dr.supplier_id = ?""",
            (dc_number, supplier_id),
        )
        record = await cur.fetchone()
        if not record:
            return {"exists": False}

        cur = await db.execute(
            "SELECT * FROM dc_photos WHERE dc_record_id = ? ORDER BY photo_type, uploaded_at",
            (record["id"],),
        )
        photos = await cur.fetchall()

    rec = dict(record)
    try:
        rec["remarks"] = json.loads(rec.get("remarks") or "[]")
    except Exception:
        rec["remarks"] = []

    return {
        "exists": True,
        "record": rec,
        "photos": [dict(p) for p in photos],
    }


@router.post("/stage2/save")
async def stage2_save(
    dc_number: str = Form(...),
    supplier_id: int = Form(...),
    stage2_by: Optional[int] = Form(default=None),
    remarks: str = Form(default="[]"),
    stage1_skipped: bool = Form(default=False),
    invoice_date: str = Form(default=""),
    num_items: int = Form(default=0),
    photos: List[UploadFile] = File(default=[]),
    photo_types: List[str] = Form(default=[]),
):
    if len(photos) != len(photo_types):
        raise HTTPException(
            status_code=400,
            detail=f"photos count ({len(photos)}) != photo_types count ({len(photo_types)})",
        )

    # Validate + sanitise remarks
    try:
        parsed_remarks = json.loads(remarks)
        if not isinstance(parsed_remarks, list):
            parsed_remarks = []
    except json.JSONDecodeError:
        parsed_remarks = []
    parsed_remarks = [r for r in parsed_remarks if r in _VALID_REMARKS]
    remarks_json = json.dumps(parsed_remarks)

    folder = os.path.join(PHOTOS_DIR, f"{dc_number}_{supplier_id}")

    async with get_db() as db:
        db.row_factory = aiosqlite.Row

        cur = await db.execute(
            "SELECT id, stage2_by, stage2_done_at FROM dc_records "
            "WHERE dc_number = ? AND supplier_id = ?",
            (dc_number, supplier_id),
        )
        existing = await cur.fetchone()

        if stage1_skipped and not existing:
            # No prior record — create it directly here (still requires the base
            # checking fields; corrected photo / verified-by remain optional).
            if not invoice_date:
                raise HTTPException(
                    status_code=400,
                    detail="invoice_date is required when stage1_skipped=true",
                )
            if stage2_by is not None:
                cur = await db.execute(
                    """INSERT INTO dc_records
                       (dc_number, supplier_id, status, stage1_skipped,
                        stage2_by, stage2_done_at,
                        invoice_date, num_items, remarks)
                       VALUES (?, ?, 'stage2', 1, ?, CURRENT_TIMESTAMP, ?, ?, ?)""",
                    (dc_number, supplier_id, stage2_by, invoice_date, num_items, remarks_json),
                )
            else:
                cur = await db.execute(
                    """INSERT INTO dc_records
                       (dc_number, supplier_id, status, stage1_skipped,
                        invoice_date, num_items, remarks)
                       VALUES (?, ?, 'stage1', 1, ?, ?, ?)""",
                    (dc_number, supplier_id, invoice_date, num_items, remarks_json),
                )
            record_id = cur.lastrowid
            log.info(
                "Created record id=%d dc=%s directly via /stage2/save (stage2_by=%s)",
                record_id, dc_number, stage2_by,
            )

        elif existing:
            record_id = existing["id"]
            if stage2_by is not None:
                # Preserve stage2_by and stage2_done_at if already set (never overwrite)
                final_stage2_by = existing["stage2_by"] if existing["stage2_by"] else stage2_by
                if existing["stage2_done_at"] is None:
                    await db.execute(
                        """UPDATE dc_records
                           SET stage2_by = ?, stage2_done_at = CURRENT_TIMESTAMP,
                               remarks = ?, status = 'stage2',
                               updated_at = CURRENT_TIMESTAMP
                           WHERE id = ?""",
                        (final_stage2_by, remarks_json, record_id),
                    )
                else:
                    await db.execute(
                        """UPDATE dc_records
                           SET stage2_by = ?, remarks = ?, status = 'stage2',
                               updated_at = CURRENT_TIMESTAMP
                           WHERE id = ?""",
                        (final_stage2_by, remarks_json, record_id),
                    )
                log.info("Updated Stage 2 for record id=%d", record_id)
            else:
                # No corrected photo attached this visit — remarks-only update.
                # Never touch stage2_by / stage2_done_at / status.
                await db.execute(
                    """UPDATE dc_records
                       SET remarks = ?, updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?""",
                    (remarks_json, record_id),
                )
                log.info("Updated remarks only for record id=%d", record_id)

        else:
            raise HTTPException(
                status_code=400,
                detail="DC record not found. Use stage1_skipped=true to create without Stage 1.",
            )

        # Save uploaded photos
        for photo, photo_type in zip(photos, photo_types):
            if not photo.filename:
                continue
            path = await _save_photo(photo, folder, photo_type)
            await db.execute(
                "INSERT INTO dc_photos (dc_record_id, photo_type, file_path, uploaded_by) "
                "VALUES (?, ?, ?, ?)",
                (record_id, photo_type, path, stage2_by),
            )

        await db.commit()

    return {"id": record_id, "dc_number": dc_number, "status": "saved"}
