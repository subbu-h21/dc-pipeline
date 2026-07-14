# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DC Pipeline — internal tool for Shubhada Pharma to track delivery challan (DC) verification. Physical deliveries arrive with paper invoices; this app makes sure each one is photo-documented and verified before items reach the shelves. It covers **item checking** and **item verification** of a 3-stage workflow — internally still called Stage 1 / Stage 2 in the DB and backend routes, but the frontend presents them as **one unified workflow** (see Architecture). Stage 3 (CRM entry) is a separate, independent codebase (`dc image recognition v3.x/dc-entry-automation`) — do not edit it from here; the two apps are linked only by a UI hyperlink and a shared supplier CSV, not a shared DB or API.

## Commands

### First-time setup
```
setup.bat
```
Creates `backend/venv`, installs `backend/requirements.txt` into it, installs `frontend/` npm deps, and copies `backend/.env.example` → `backend/.env` if one doesn't already exist. Fill in `backend/.env` afterward (`STAGE3_SUPPLIER_CSV`, `STAGE3_URL`, `DASHBOARD_PIN`, `OPENROUTER_API_KEY`, `EXTRACTION_MODEL`). `supplier_names.csv` (gitignored — real distributor list, not shipped in the repo) needs to be placed at the repo root (`dc_pipeline/supplier_names.csv`) to match the default `STAGE3_SUPPLIER_CSV=../supplier_names.csv`, or point the env var elsewhere.

### Day-to-day development
Run backend and frontend separately so the frontend hot-reloads:
```
cd backend && venv\Scripts\activate && python main.py     # API on :3002 (PORT in .env)
cd frontend && npm run dev                                 # Vite dev server on :5174, proxies API calls to :3002 (see vite.config.ts)
```

### Build / typecheck frontend
```
cd frontend && npm run build     # tsc && vite build -> frontend/dist, served by the backend in production
```

There are no test suites or lint scripts configured in either package — don't invent `npm test`/`pytest` invocations.

### "Production" launch
```
start.bat
```
Builds the frontend (`npm run build`), then opens a new window that activates `backend/venv` and starts `python main.py`, serving the API and the built SPA together on port 3002. Polls the port and auto-opens the browser once it's up. Does not manage the Cloudflare tunnel — that runs as a separate persistent Windows service, not something this script starts or stops. The backend is typically left running for long stretches (including through the tunnel in production); running `start.bat` again will spawn a second backend process on the same port unless the prior one is stopped first — confirm before doing so if someone else may be relying on the live instance.

**The backend does not auto-reload.** `main.py` runs `uvicorn.run(..., reload=False)` implicitly (no `--reload`), so editing any backend `.py` file requires killing and restarting `python main.py` before the change takes effect — the process is typically left running persistently (including through the Cloudflare tunnel in production), so confirm before restarting it if someone else may be relying on it live.

Config is read from `backend/.env` (see `backend/.env.example` for all keys: `PORT`, `ALLOWED_ORIGINS`, `DB_PATH`, `PHOTOS_DIR`, `STAGE3_SUPPLIER_CSV`, `STAGE3_URL`, `DASHBOARD_PIN`, `OPENROUTER_API_KEY`, `EXTRACTION_MODEL`).

## Architecture

**Single SQLite DB, no ORM/migrations.** Schema lives entirely in `backend/database.py` as one `executescript` block, run idempotently (`CREATE TABLE IF NOT EXISTS`) on startup. Four tables: `suppliers`, `employees`, `dc_records`, `dc_photos`. WAL mode is on.

**One unified frontend page, two backend stage routes underneath.** `frontend/src/pages/DCWorkflow.tsx` (route `/dc`) is the only entry point — it replaced the old separate `Stage1.tsx`/`Stage2.tsx` pages and hub cards. Its landing screen offers **New DC** (blank form) and **Find DC** (search by supplier + DC number, or browse a per-supplier list — mainly so staff can check a DC doesn't already exist before creating a duplicate). Both paths land on the *same* form component: blank if new or not found, pre-filled if an existing record was found. Package/Invoice photo cards sit above the DC-detail fields, because uploading the invoice photo is what triggers extraction and fills the fields below it (see next section). Corrected DC Photo is optional; Verified By and Remarks are **hidden entirely** until a corrected photo is attached (new upload, or already on file from a prior visit) — nobody can claim verification credit without the photo to back it. Supplier, DC Number, and Checked By all become disabled inputs once editing an existing found record (Supplier/DC Number are the identity key; Checked By is locked because the backend now preserves the original value regardless — see below — so leaving it editable would be misleading). Package and Invoice Photo both cap at 3 (existing + newly-added combined), removable via `DELETE /photos/{photo_id}` behind a confirm dialog, with client-side clamping so a multi-select can't exceed the remaining slots.

**Save always upserts Stage 1, then conditionally upserts Stage 2.** `handleSave` in `DCWorkflow.tsx` calls `POST /stage1/save` unconditionally (dc_number, supplier_id, stage1_by, invoice_date, num_items, any newly-added package/invoice photos), then — only if a corrected photo was attached this visit or the remarks/verification section was touched — follows with `POST /stage2/save`. This makes the old Stage 2 "Path B" (`stage1_skipped=true`, creating a record with no prior Stage 1) effectively dead code from the current UI, since `/stage1/save` always runs first and guarantees the record exists before `/stage2/save` is ever called; the branch is kept in `routes/stage2.py` only for API-level robustness/back-compat, not exercised by the frontend. A `stage1Saved` flag in `DCWorkflow.tsx` skips re-sending `/stage1/save` on a retry after `/stage2/save` fails, so a transient stage2 error can't duplicate the package/invoice photos on resubmission — `/stage1/save` has no dedupe guard of its own, it always inserts whatever `dc_photos` rows it's given.

**`dc_records` is keyed by `(dc_number, supplier_id)`, not just an id.** Every stage route (`routes/stage1.py`, `routes/stage2.py`) looks up by that pair and upserts — there's no separate "create" vs "update" endpoint. Key nuances:
- `stage1_by`/`stage1_done_at` and `stage2_by`/`stage2_done_at` are **both never overwritten once set**, even if their respective save endpoint is called again — same "preserve original value" pattern on both sides. Stage 1 needed this added because the merged workflow re-POSTs `/stage1/save` on every visit to an already-checked record (even one being opened just to add a remark); without it, Checked By and the "Checked by … on `<date>`" banner could silently get reassigned/rewritten by whoever reopens the record.
- `stage2_by` in `/stage2/save` is **optional** (`Form(default=None)`) — when omitted, the endpoint only updates `remarks` and leaves `stage2_by`/`stage2_done_at`/`status` untouched. This is what lets someone add/edit remarks on an already-checked-but-not-yet-verified record without accidentally promoting it to verified, or without needing a name to attach.
- **Deleting a `corrected`-type photo is the one case that *does* reset `stage2_by`/`stage2_done_at`/`status`** (back to `NULL`/`NULL`/`'stage1'`) — handled in `routes/photos.py`'s `DELETE /photos/{photo_id}`, not in `stage2.py`. Without this, the "never overwrite" rule above would make a re-verification with a *different* employee silently keep crediting whoever verified it first, since the stale `stage2_by` would still be truthy.
- `remarks` is a JSON array stored in a TEXT column, filtered server-side against a fixed `_VALID_REMARKS` set before being written.
- **Scoring is flat and additive, not tiered.** `routes/dashboard.py`'s leaderboard query: `stage1_by` → 1 point, `stage2_by` (when `status='stage2'`) → 2 points, summed independently per employee — no special-casing for `stage1_skipped`. The same person doing both on one record naturally nets 1+2=3; two different people get 1 and 2 respectively. `stage1_skipped` still exists as a column (Dashboard's filter/stat card still reads it) but no longer affects point values.

**OpenRouter-based extraction now lives in this app too, not just Stage 3.** `backend/services/client.py` (sync `OpenAI` client, OpenRouter base URL) and `backend/services/extraction.py` (`extract_dc_summary`) back `POST /stage1/extract`: the invoice photo is sent with a forced tool-call (`extract_dc_summary`, schema: `dc_number`, `supplier_name`, `item_count`) to a Gemini/other vision model over OpenRouter, then the returned `supplier_name` is fuzz-matched (`rapidfuzz.WRatio`, threshold 55) against the **DB** `suppliers` table (not the CSV — the CSV only seeds the table once at startup). Deliberately narrower than Stage 3's `services/openrouter.py`: no per-product extraction, no batch/MRP/expiry fields, no reasoning-effort toggle — just enough to autofill the three Stage 1 summary fields. Uses a **sync** client called via `asyncio.to_thread(...)` from the async route handler (not `AsyncOpenAI`) since only one extraction call happens at a time here; this keeps the event loop non-blocking without the async-client complexity Stage 3 has. `invoice_date` is deliberately **not** extracted — it's never in the tool schema or prompt, and the frontend just defaults it to today's date, editable. The frontend also offers a model-override dropdown (`google/gemini-2.5-flash-lite` default, `xiaomi/mimo-v2.5` alternative) sent as a `model` form field, overriding `EXTRACTION_MODEL` from `.env` for that one call.

**Photos are stored on the filesystem, not in the DB.** `PHOTOS_DIR/{dc_number}_{supplier_id}/` holds the files; `dc_photos.file_path` just points at them. A background loop (started in `main.py`'s `startup` event) runs every 24h and nulls out `file_path` + deletes the file for any photo older than 7 days — photo binaries are intentionally short-lived, only metadata persists. `DCWorkflow.tsx`'s `ReadOnlyPhoto` component checks `file_path` before rendering an `<img>` and shows an "EXPIRED" placeholder instead when it's null (matching `DCDetail.tsx`'s equivalent), so reopening an old DC via Find DC doesn't show a broken image icon. Client-side blur detection (`frontend/src/utils/blur.ts`, Laplacian-variance on a downscaled canvas) blocks blurry photos from ever being uploaded, rejecting them in the browser before the network call.

**`SearchableSelect` (the shared Supplier/Checked By/Verified By combobox in `DCWorkflow.tsx`) portals its dropdown to `document.body`.** It's positioned with `position: fixed` computed from `getBoundingClientRect()` — necessary because any ancestor `.card` has `overflow: hidden` (for rounded-corner clipping) and would otherwise clip the list. It also flips to open upward when there isn't room below (checked against `window.innerHeight`, since this is a camera-upload-first mobile app where a picker near the bottom of a short screen would otherwise render off-screen), and closes on both outside-click and `blur` (item selection uses `onMouseDown` + `preventDefault()` so a blur-close can't race a click-to-select). If you touch this component, keep both close paths and the upward-flip — they were each added to fix a real, previously-shipped bug.

**Dashboard endpoints (`routes/dashboard.py`) are PIN-gated per-request**, not session/cookie-based — every call passes `pin` as a query param, checked against `DASHBOARD_PIN` in `config.py`. There's no auth beyond this PIN anywhere in the app.

**Suppliers and employees are seeded, not managed via UI.** `backend/seed.py` runs once on startup only if the tables are empty. Employees come from `backend/staff_names.txt` (one name per line, path overridable via `STAFF_NAMES_FILE`), loaded through `config.load_staff_names()` — kept out of source and gitignored since it's real staff PII; `backend/staff_names.example.txt` is the committed template `setup.bat` copies from. Suppliers are loaded from an external CSV (`STAGE3_SUPPLIER_CSV`) that is shared with the separate Stage 3 app — this repo only reads it, it doesn't own it.

**Production deployment is a single process.** `backend/main.py` mounts `frontend/dist/assets` as static files and catches all other paths with an SPA fallback (`serve_spa`) returning `index.html` — there is no separate frontend server outside of dev. This means **any change to frontend source requires `npm run build`** before it's visible through the backend; the Vite dev server (port 5174, `npm run dev`) is only used for local iteration and proxies API calls per `vite.config.ts`. Note the catch-all `@app.get("/{full_path:path}")` route is defined *before* `@app.get("/health")` in `main.py` — since FastAPI matches routes in registration order, `GET /health` currently gets swallowed by the SPA fallback and returns HTML, not `{"status": "ok"}`. Harmless for POST-based API routes (method mismatch means the catch-all doesn't intercept them), but don't rely on `/health` returning JSON without moving it above the catch-all first.

**Cross-app links depend on hostname, not hardcoded URLs.** `frontend/src/App.tsx`'s hub page links to Stage 3 (CRM) and Billing by checking `window.location.hostname` — public tunnel domain (`*.shubhada.live`) resolves to stable subdomains (`dc.shubhada.live` for Stage 3, `sales.shubhada.live` for Billing; this DC Pipeline app itself is reachable at the bare `shubhada.live`); otherwise it falls back to swapping the port on the current host for same-WiFi/LAN access, since the shop PC's LAN IP is DHCP-assigned and can't be hardcoded.

## Repo layout

- `backend/` — FastAPI app; `routes/` has one file per resource (`stage1`, `stage2`, `photos`, `suppliers`, `employees`, `dashboard`); `services/` holds the OpenRouter extraction client (`client.py`, `extraction.py`)
- `frontend/src/pages/` — one component per screen (`DCWorkflow` — the unified checking+verification flow, `Dashboard`, `Filters`, `DCDetail`); `App.tsx` is the hub/landing page, linking to `/dc`
