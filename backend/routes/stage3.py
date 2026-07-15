import logging

import aiosqlite
from fastapi import APIRouter, Form

from database import get_db

log = logging.getLogger(__name__)
router = APIRouter()


async def _find_or_create_supplier(db: aiosqlite.Connection, name: str) -> int:
    cur = await db.execute(
        "SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE", (name,)
    )
    row = await cur.fetchone()
    if row:
        return row["id"]

    await db.execute("INSERT OR IGNORE INTO suppliers (name) VALUES (?)", (name,))
    cur = await db.execute(
        "SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE", (name,)
    )
    row = await cur.fetchone()
    return row["id"]


async def _find_employee(db: aiosqlite.Connection, name: str) -> int | None:
    if not name:
        return None
    cur = await db.execute(
        "SELECT id FROM employees WHERE name = ? COLLATE NOCASE", (name,)
    )
    row = await cur.fetchone()
    return row["id"] if row else None


@router.post("/stage3/save")
async def stage3_save(
    dc_number: str = Form(...),
    supplier_name: str = Form(...),
    checked_by: str = Form(default=""),
    reference_no: str = Form(default=""),
):
    async with get_db() as db:
        db.row_factory = aiosqlite.Row

        supplier_id = await _find_or_create_supplier(db, supplier_name)
        employee_id = await _find_employee(db, checked_by)

        cur = await db.execute(
            """INSERT OR IGNORE INTO stage3_entries
               (dc_number, supplier_id, employee_id, reference_no)
               VALUES (?, ?, ?, ?)""",
            (dc_number, supplier_id, employee_id, reference_no or None),
        )
        recorded = cur.rowcount > 0
        await db.commit()

    log.info(
        "Stage 3 %s: dc=%s supplier=%r employee_id=%s ref=%r",
        "recorded" if recorded else "already existed",
        dc_number, supplier_name, employee_id, reference_no,
    )

    return {"recorded": recorded, "matched_employee": employee_id is not None}
