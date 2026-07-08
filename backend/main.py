import asyncio
import logging
import os

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import ALLOWED_ORIGINS, DB_PATH, PHOTOS_DIR, PORT
from database import get_db, init_db
from seed import seed_if_empty

from routes.dashboard import router as dashboard_router
from routes.employees import router as employees_router
from routes.photos import router as photos_router
from routes.stage1 import router as stage1_router
from routes.stage2 import router as stage2_router
from routes.suppliers import router as suppliers_router

log = logging.getLogger(__name__)

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

app = FastAPI(title="DC Pipeline")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(suppliers_router)
app.include_router(employees_router)
app.include_router(stage1_router)
app.include_router(stage2_router)
app.include_router(photos_router)
app.include_router(dashboard_router)

# Serve built frontend — must come after all API routes
_assets_dir = os.path.join(FRONTEND_DIST, "assets")
if os.path.isdir(_assets_dir):
    app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))


async def _photo_cleanup_loop() -> None:
    import aiosqlite

    cleanup_log = logging.getLogger("cleanup")
    while True:
        try:
            async with aiosqlite.connect(DB_PATH) as db:
                db.row_factory = aiosqlite.Row
                cur = await db.execute(
                    "SELECT id, file_path FROM dc_photos "
                    "WHERE file_path IS NOT NULL "
                    "AND uploaded_at < datetime('now', '-7 days')"
                )
                rows = await cur.fetchall()
                count = 0
                for row in rows:
                    path = row["file_path"]
                    if path and os.path.exists(path):
                        try:
                            os.remove(path)
                            count += 1
                        except OSError:
                            pass
                    await db.execute(
                        "UPDATE dc_photos SET file_path = NULL WHERE id = ?",
                        (row["id"],),
                    )
                await db.commit()
                if count:
                    cleanup_log.info("Deleted %d old photo files", count)
        except Exception:
            cleanup_log.exception("Photo cleanup failed")
        await asyncio.sleep(24 * 3600)


@app.on_event("startup")
async def startup() -> None:
    os.makedirs(PHOTOS_DIR, exist_ok=True)
    await init_db()
    await seed_if_empty()
    asyncio.create_task(_photo_cleanup_loop())
    log.info("DC Pipeline backend ready on port %d", PORT)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=PORT)
