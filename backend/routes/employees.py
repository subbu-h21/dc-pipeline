import aiosqlite
from fastapi import APIRouter

from database import get_db

router = APIRouter()


@router.get("/employees")
async def list_employees():
    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT id, name FROM employees ORDER BY name")
        rows = await cur.fetchall()
    return {"employees": [dict(r) for r in rows]}
