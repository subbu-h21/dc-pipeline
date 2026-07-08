import os

import aiosqlite
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from database import get_db

router = APIRouter()


@router.get("/photos/{photo_id}")
async def get_photo(photo_id: int):
    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT file_path FROM dc_photos WHERE id = ?", (photo_id,)
        )
        row = await cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Photo not found")
    if not row["file_path"]:
        raise HTTPException(status_code=410, detail="Photo file has been deleted (>7 days)")
    if not os.path.exists(row["file_path"]):
        raise HTTPException(status_code=404, detail="Photo file missing from disk")

    return FileResponse(row["file_path"])


@router.delete("/photos/{photo_id}")
async def delete_photo(photo_id: int):
    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT file_path, photo_type, dc_record_id FROM dc_photos WHERE id = ?", (photo_id,)
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Photo not found")

        path = row["file_path"]
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass

        await db.execute("DELETE FROM dc_photos WHERE id = ?", (photo_id,))

        if row["photo_type"] == "corrected":
            # Deleting the corrected photo un-verifies the record — otherwise
            # a stale stage2_by would silently survive and get reused (never
            # overwritten) the next time this record is verified with a new
            # photo and a different Verified By.
            await db.execute(
                """UPDATE dc_records
                   SET stage2_by = NULL, stage2_done_at = NULL, status = 'stage1',
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (row["dc_record_id"],),
            )

        await db.commit()

    return {"deleted": photo_id}
