import csv
import html as _html
import logging
import os

from dotenv import load_dotenv

log = logging.getLogger(__name__)

load_dotenv()

PORT: int = int(os.getenv("PORT", "3002"))
ALLOWED_ORIGINS: list[str] = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5174").split(",")
]
DB_PATH: str = os.getenv("DB_PATH", "./dc_pipeline.db")
PHOTOS_DIR: str = os.getenv("PHOTOS_DIR", "./dc_pipeline_photos")
STAGE3_URL: str = os.getenv("STAGE3_URL", "http://localhost:5173")
DASHBOARD_PIN: str = os.getenv("DASHBOARD_PIN", "123456")

OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
OPENROUTER_SITE_URL: str = os.getenv("OPENROUTER_SITE_URL", "http://localhost:5174")
OPENROUTER_SITE_TITLE: str = os.getenv("OPENROUTER_SITE_TITLE", "DC Pipeline")
EXTRACTION_MODEL: str = os.getenv("EXTRACTION_MODEL", "google/gemini-3.1-flash-lite")

STAGE3_SUPPLIER_CSV: str = os.getenv(
    "STAGE3_SUPPLIER_CSV",
    "../supplier_names.csv",
)

STAFF_NAMES_FILE: str = os.getenv("STAFF_NAMES_FILE", "./staff_names.txt")


def load_staff_names() -> list[str]:
    if not os.path.exists(STAFF_NAMES_FILE):
        log.warning("Staff names file not found at %s", STAFF_NAMES_FILE)
        return []
    with open(STAFF_NAMES_FILE, encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]


def load_supplier_names() -> list[str]:
    if not os.path.exists(STAGE3_SUPPLIER_CSV):
        log.warning("Supplier CSV not found at %s", STAGE3_SUPPLIER_CSV)
        return []
    names: list[str] = []
    with open(STAGE3_SUPPLIER_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = _html.unescape(row.get("Supplier Name", "")).strip()
            if name:
                names.append(name)
    log.info("Loaded %d suppliers from CSV", len(names))
    return sorted(names, key=str.upper)
