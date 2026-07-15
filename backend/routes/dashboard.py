import json
import logging
import os
from typing import List, Optional

import aiosqlite
from fastapi import APIRouter, HTTPException, Query

from config import DASHBOARD_PIN, PHOTOS_DIR
from database import get_db

log = logging.getLogger(__name__)
router = APIRouter()


def _check_pin(pin: str) -> None:
    if pin != DASHBOARD_PIN:
        raise HTTPException(status_code=403, detail="Invalid PIN")


@router.get("/dashboard/summary")
async def dashboard_summary(
    pin: str = Query(...),
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
):
    _check_pin(pin)

    async with get_db() as db:
        db.row_factory = aiosqlite.Row

        async def scalar(sql: str, params: tuple = ()):
            cur = await db.execute(sql, params)
            row = await cur.fetchone()
            return row[0] if row else 0

        total_dcs = await scalar(
            "SELECT COUNT(*) FROM dc_records WHERE date(created_at) BETWEEN ? AND ?",
            (from_date, to_date),
        )

        dcs_with_remarks = await scalar(
            "SELECT COUNT(*) FROM dc_records "
            "WHERE date(created_at) BETWEEN ? AND ? "
            "AND remarks IS NOT NULL AND remarks != '[]'",
            (from_date, to_date),
        )

        stage1_skipped_count = await scalar(
            "SELECT COUNT(*) FROM dc_records "
            "WHERE date(created_at) BETWEEN ? AND ? AND stage1_skipped = 1",
            (from_date, to_date),
        )

        active_employees = await scalar(
            """SELECT COUNT(DISTINCT emp) FROM (
                   SELECT stage1_by AS emp FROM dc_records
                   WHERE date(created_at) BETWEEN ? AND ? AND stage1_by IS NOT NULL
                   UNION
                   SELECT stage2_by AS emp FROM dc_records
                   WHERE date(created_at) BETWEEN ? AND ? AND stage2_by IS NOT NULL
               )""",
            (from_date, to_date, from_date, to_date),
        )

        # Employee leaderboard — flat scoring: stage1_by = 1pt, stage2_by = 2pts,
        # stage3 (dc-entry-automation CRM save, tracked separately in
        # stage3_entries — see routes/stage3.py) = 3pts, summed independently
        # per employee (same person doing all three on one DC naturally gets
        # 1+2+3=6 — no special-casing needed).
        cur = await db.execute(
            """SELECT e.name,
                      COALESCE((
                          SELECT COUNT(*) * 1.0 FROM dc_records
                          WHERE stage1_by = e.id
                          AND date(created_at) BETWEEN ? AND ?
                      ), 0) AS stage1_pts,
                      COALESCE((
                          SELECT COUNT(*) * 2.0 FROM dc_records
                          WHERE stage2_by = e.id AND status = 'stage2'
                          AND date(created_at) BETWEEN ? AND ?
                      ), 0) AS stage2_pts,
                      COALESCE((
                          SELECT COUNT(*) * 3.0 FROM stage3_entries
                          WHERE employee_id = e.id
                          AND date(done_at) BETWEEN ? AND ?
                      ), 0) AS stage3_pts
               FROM employees e""",
            (from_date, to_date, from_date, to_date, from_date, to_date),
        )
        leaderboard = []
        for row in await cur.fetchall():
            s1 = float(row["stage1_pts"] or 0)
            s2 = float(row["stage2_pts"] or 0)
            s3 = float(row["stage3_pts"] or 0)
            total = round(s1 + s2 + s3, 1)
            if total > 0:
                leaderboard.append(
                    {
                        "name": row["name"],
                        "stage1_pts": s1,
                        "stage2_pts": round(s2, 1),
                        "stage3_pts": round(s3, 1),
                        "total_pts": total,
                    }
                )
        leaderboard.sort(key=lambda x: x["total_pts"], reverse=True)

        # Supplier correction rate
        cur = await db.execute(
            """SELECT s.name AS supplier,
                      COUNT(*) AS total_dcs,
                      SUM(CASE WHEN dr.remarks IS NOT NULL AND dr.remarks != '[]' THEN 1 ELSE 0 END)
                          AS dcs_with_remarks
               FROM dc_records dr
               JOIN suppliers s ON dr.supplier_id = s.id
               WHERE date(dr.created_at) BETWEEN ? AND ?
               GROUP BY s.id, s.name
               ORDER BY (CAST(dcs_with_remarks AS REAL) / total_dcs) DESC""",
            (from_date, to_date),
        )
        supplier_rows = []
        for row in await cur.fetchall():
            total = row["total_dcs"]
            with_r = row["dcs_with_remarks"] or 0
            supplier_rows.append(
                {
                    "supplier": row["supplier"],
                    "total_dcs": total,
                    "dcs_with_remarks": with_r,
                    "rate_pct": round(with_r / total * 100, 1) if total else 0,
                }
            )

    return {
        "total_dcs": total_dcs,
        "dcs_with_remarks": dcs_with_remarks,
        "stage1_skipped_count": stage1_skipped_count,
        "active_employees": active_employees,
        "employee_leaderboard": leaderboard,
        "supplier_correction_rate": supplier_rows,
    }


@router.get("/dashboard/filters")
async def dashboard_filters(
    pin: str = Query(...),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    dc_number: Optional[str] = Query(None),
    remark: List[str] = Query(default=[]),
    supplier_id: Optional[int] = Query(default=None),
    status: Optional[str] = Query(default=None),
    stage1_skipped: Optional[bool] = Query(default=None),
    employee_id: Optional[int] = Query(default=None),
):
    _check_pin(pin)

    conditions: list = []
    params: list = []

    if dc_number:
        conditions.append("dr.dc_number LIKE ?")
        params.append(f"%{dc_number}%")
    elif from_date and to_date:
        conditions.append("date(dr.created_at) BETWEEN ? AND ?")
        params.extend([from_date, to_date])
    else:
        conditions.append("1=0")

    if status and status != "all":
        conditions.append("dr.status = ?")
        params.append(status)

    if stage1_skipped is not None:
        conditions.append("dr.stage1_skipped = ?")
        params.append(1 if stage1_skipped else 0)

    if supplier_id is not None:
        conditions.append("dr.supplier_id = ?")
        params.append(supplier_id)

    if employee_id is not None:
        conditions.append("(dr.stage1_by = ? OR dr.stage2_by = ?)")
        params.extend([employee_id, employee_id])

    if remark:
        # Match rows where the remarks JSON array contains at least one selected remark
        remark_clauses = [f'dr.remarks LIKE ?'] * len(remark)
        for r in remark:
            params.append(f'%"{r}"%')
        conditions.append(f"({' OR '.join(remark_clauses)})")

    where = " AND ".join(conditions)

    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            f"""SELECT dr.id, dr.dc_number, dr.invoice_date, dr.num_items,
                       dr.status, dr.stage1_skipped, dr.remarks,
                       dr.stage1_done_at, dr.stage2_done_at, dr.created_at,
                       s.name  AS supplier_name,
                       e1.name AS stage1_by_name,
                       e2.name AS stage2_by_name
                FROM dc_records dr
                LEFT JOIN suppliers s  ON dr.supplier_id = s.id
                LEFT JOIN employees e1 ON dr.stage1_by  = e1.id
                LEFT JOIN employees e2 ON dr.stage2_by  = e2.id
                WHERE {where}
                ORDER BY dr.created_at DESC""",
            params,
        )
        rows = await cur.fetchall()

    result = []
    for row in rows:
        d = dict(row)
        try:
            d["remarks"] = json.loads(d.get("remarks") or "[]")
        except Exception:
            d["remarks"] = []
        result.append(d)

    return result


@router.get("/dashboard/dc/{dc_record_id}")
async def get_dc_detail(dc_record_id: int, pin: str = Query(...)):
    _check_pin(pin)

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
               WHERE dr.id = ?""",
            (dc_record_id,),
        )
        record = await cur.fetchone()
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")

        cur = await db.execute(
            """SELECT p.id, p.photo_type, p.file_path, p.uploaded_at,
                      e.name AS uploaded_by_name
               FROM dc_photos p
               LEFT JOIN employees e ON p.uploaded_by = e.id
               WHERE p.dc_record_id = ?
               ORDER BY p.photo_type, p.uploaded_at""",
            (record["id"],),
        )
        photos = await cur.fetchall()

    rec = dict(record)
    try:
        rec["remarks"] = json.loads(rec.get("remarks") or "[]")
    except Exception:
        rec["remarks"] = []

    return {
        "record": rec,
        "photos": [dict(p) for p in photos],
    }


@router.delete("/dashboard/dc/{dc_record_id}")
async def delete_dc_record(dc_record_id: int, pin: str = Query(...)):
    _check_pin(pin)

    async with get_db() as db:
        db.row_factory = aiosqlite.Row

        cur = await db.execute(
            "SELECT dc_number, supplier_id FROM dc_records WHERE id = ?",
            (dc_record_id,),
        )
        record = await cur.fetchone()
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")

        cur = await db.execute(
            "SELECT file_path FROM dc_photos WHERE dc_record_id = ?",
            (dc_record_id,),
        )
        photos = await cur.fetchall()

        deleted_files = 0
        for photo in photos:
            path = photo["file_path"]
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                    deleted_files += 1
                except OSError:
                    pass

        # Remove folder if now empty
        folder = os.path.join(
            PHOTOS_DIR, f"{record['dc_number']}_{record['supplier_id']}"
        )
        try:
            if os.path.isdir(folder) and not os.listdir(folder):
                os.rmdir(folder)
        except OSError:
            pass

        await db.execute("DELETE FROM dc_photos WHERE dc_record_id = ?", (dc_record_id,))
        await db.execute("DELETE FROM dc_records WHERE id = ?", (dc_record_id,))
        await db.commit()

    log.info(
        "Deleted dc_record id=%d (%d photo files removed)", dc_record_id, deleted_files
    )
    return {"deleted": dc_record_id}
