# DC Pipeline

Internal tool for Shubhada Pharma to track delivery challan (DC) verification. Physical deliveries arrive with paper invoices; this app makes sure each one is photo-documented and verified before items reach the shelves. Covers **item checking** and **item verification** — presented as one unified workflow, though internally still split into Stage 1 / Stage 2.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | Python + FastAPI + Uvicorn + aiosqlite |
| AI | Gemini (or other vision models) via OpenRouter |
| DB | SQLite (single file, no ORM/migrations) |

---

## Setup (New Machine)

### Step 1 — Install prerequisites

| Tool | Download |
|---|---|
| Python 3.11+ | https://python.org/downloads |
| Node.js 18+ | https://nodejs.org |
| Git | https://git-scm.com |

### Step 2 — Clone the repo

```bash
git clone https://github.com/subbu-h21/dc-pipeline.git
cd dc-pipeline
```

### Step 3 — Run setup.bat

Double-click **`setup.bat`** in the project folder.

This will automatically:
- Create the Python virtual environment (`backend/venv`)
- Install all backend Python dependencies
- Install all frontend Node dependencies
- Create `backend\.env` from `.env.example`
- Create `backend\staff_names.csv` from `staff_names.example.csv` (placeholder names)

### Step 4 — Add your real data

Three things are deliberately **not** in the repo (real business/personal data, gitignored) and need to be added by hand before the first run:

1. **`backend\.env`** — fill in:
   ```env
   STAGE3_SUPPLIER_CSV=../supplier_names.csv
   STAGE3_URL=http://localhost:5173
   DASHBOARD_PIN=123456
   OPENROUTER_API_KEY=sk-or-v1-...
   EXTRACTION_MODEL=google/gemini-2.5-flash-lite
   ```
   > Get an OpenRouter key at https://openrouter.ai/keys

2. **`backend\staff_names.csv`** — replace the placeholder names with your real staff list. Needs a header row with an `Employee Name` column. This seeds the `employees` table on first run.

3. **`supplier_names.csv`** — place your real distributor list at the **repo root** (`dc-pipeline\supplier_names.csv`, next to `backend/` and `frontend/`), matching the default `STAGE3_SUPPLIER_CSV=../supplier_names.csv` above. Needs a header row with a `Supplier Name` column. This seeds the `suppliers` table on first run.

> Both lists can also be topped up later without touching these files or restarting the backend — see **Update Employees & Suppliers** in the app (DC Checking & Verification → landing screen), which lets you upload a `.csv` directly and appends any new names to the database.

**About the database:** you don't create it manually. `backend/dc_pipeline.db` is generated automatically the first time the backend starts — the schema is applied idempotently on every startup, and `suppliers`/`employees` are seeded *once*, from the two files above, only if those tables are still empty. So steps 2 and 3 above must be done **before** the first launch; if you launch first and add the files after, restart the backend once and it'll still pick them up as long as those tables ended up empty on the first pass. If they didn't (e.g. you launched, it seeded 0 suppliers because the CSV was missing, and you want to reseed), delete `backend/dc_pipeline.db` and start again.

### Step 5 — Launch the app

Double-click **`start.bat`**.

This builds the frontend, starts the backend in its own window, and automatically opens **http://localhost:3002** once it's ready.

---

## Day-to-day development

Run backend and frontend separately so the frontend hot-reloads:

```bash
cd backend && venv\Scripts\activate && python main.py     # API on :3002
cd frontend && npm run dev                                 # Vite dev server on :5174, proxies to :3002
```

---

## Project Structure

```
dc-pipeline/
├── backend/
│   ├── main.py                  # FastAPI app entry point, serves built frontend in prod
│   ├── config.py                # Env var loading, staff/supplier file loaders
│   ├── database.py              # Schema (executescript, idempotent)
│   ├── seed.py                  # Seeds suppliers/employees once, if tables are empty
│   ├── requirements.txt
│   ├── .env.example             # Copy this to .env and fill in keys
│   ├── staff_names.example.csv  # Copy this to staff_names.csv and fill in real names
│   ├── routes/
│   │   ├── stage1.py            # POST /stage1/save, /stage1/extract — checking
│   │   ├── stage2.py            # POST /stage2/save — verification
│   │   ├── photos.py            # Photo upload/delete
│   │   ├── suppliers.py         # GET /suppliers, POST /suppliers/upload (bulk-add via CSV)
│   │   ├── employees.py         # GET /employees, POST /employees/upload (bulk-add via CSV)
│   │   └── dashboard.py         # PIN-gated leaderboard/stats
│   └── services/
│       ├── client.py            # OpenAI SDK client → OpenRouter
│       ├── extraction.py        # Invoice photo → dc_number/supplier/item_count
│       └── csv_import.py        # Shared CSV name-column parser for the upload endpoints
├── frontend/
│   └── src/
│       ├── App.tsx              # Hub/landing page
│       └── pages/
│           ├── DCWorkflow.tsx   # Unified checking + verification flow (route /dc)
│           ├── Dashboard.tsx
│           ├── Filters.tsx
│           └── DCDetail.tsx
├── supplier_names.csv           # Not in repo — place manually, see Step 4
├── setup.bat                    # First-time setup script
└── start.bat                    # Build + launch
```
