import logging

import aiosqlite

from config import DB_PATH, load_staff_names, load_supplier_names

log = logging.getLogger(__name__)


async def seed_if_empty() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        cur = await db.execute("SELECT COUNT(*) FROM suppliers")
        if (await cur.fetchone())[0] == 0:
            names = load_supplier_names()
            for name in names:
                await db.execute("INSERT OR IGNORE INTO suppliers (name) VALUES (?)", (name,))
            await db.commit()
            log.info("Seeded %d suppliers", len(names))

        cur = await db.execute("SELECT COUNT(*) FROM employees")
        if (await cur.fetchone())[0] == 0:
            staff_names = load_staff_names()
            for name in staff_names:
                await db.execute("INSERT OR IGNORE INTO employees (name) VALUES (?)", (name,))
            await db.commit()
            log.info("Seeded %d employees", len(staff_names))
