import aiosqlite
from fastapi import APIRouter, File, HTTPException, UploadFile

from database import get_db
from services.csv_import import parse_name_column

router = APIRouter()


@router.get("/employees")
async def list_employees():
    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT id, name FROM employees ORDER BY name")
        rows = await cur.fetchall()
    return {"employees": [dict(r) for r in rows]}


@router.post("/employees/upload")
async def upload_employees(file: UploadFile = File(...)):
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file.")

    raw = await file.read()
    names = parse_name_column(raw, header_keys=["employee name", "name"])
    if not names:
        raise HTTPException(status_code=400, detail="No employee names found in the file.")

    async with get_db() as db:
        cur = await db.execute("SELECT COUNT(*) FROM employees")
        before = (await cur.fetchone())[0]
        for name in names:
            await db.execute("INSERT OR IGNORE INTO employees (name) VALUES (?)", (name,))
        await db.commit()
        cur = await db.execute("SELECT COUNT(*) FROM employees")
        after = (await cur.fetchone())[0]

    added = after - before
    return {"total_in_file": len(names), "added": added, "skipped_duplicates": len(names) - added}
