import aiosqlite
from fastapi import APIRouter

from database import get_db

router = APIRouter()


@router.get("/suppliers")
async def list_suppliers():
    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT id, name FROM suppliers ORDER BY name")
        rows = await cur.fetchall()
    return {"suppliers": [dict(r) for r in rows]}
