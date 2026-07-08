import logging

import aiosqlite

from config import DB_PATH

log = logging.getLogger(__name__)

_CREATE_SQL = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS suppliers (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS employees (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS dc_records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    dc_number      TEXT    NOT NULL,
    supplier_id    INTEGER NOT NULL REFERENCES suppliers(id),
    status         TEXT    NOT NULL DEFAULT 'stage1',
    stage1_skipped BOOLEAN NOT NULL DEFAULT 0,

    stage1_by      INTEGER REFERENCES employees(id),
    stage1_done_at TIMESTAMP,
    invoice_date   DATE,
    num_items      INTEGER,

    stage2_by      INTEGER REFERENCES employees(id),
    stage2_done_at TIMESTAMP,
    remarks        TEXT DEFAULT '[]',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(dc_number, supplier_id)
);

CREATE TABLE IF NOT EXISTS dc_photos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    dc_record_id  INTEGER NOT NULL REFERENCES dc_records(id),
    photo_type    TEXT    NOT NULL,
    file_path     TEXT,
    uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by   INTEGER REFERENCES employees(id)
);
"""


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(_CREATE_SQL)
        await db.commit()
    log.info("Database ready at %s", DB_PATH)


def get_db() -> aiosqlite.Connection:
    return aiosqlite.connect(DB_PATH)
