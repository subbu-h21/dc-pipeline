@echo off
echo =============================================
echo   DC Pipeline - First Time Setup
echo =============================================
echo.

:: Backend setup
echo [1/3] Creating Python virtual environment...
cd backend
python -m venv venv
echo Done.
echo.

echo [2/3] Installing Python dependencies...
call venv\Scripts\activate
pip install -r requirements.txt
echo Done.
echo.

:: Create .env if it doesn't exist
if not exist .env (
    copy .env.example .env
    echo Created backend\.env from .env.example
    echo.
    echo  IMPORTANT: Open backend\.env and fill in your settings before running the app.
    echo  - STAGE3_SUPPLIER_CSV  ^(path to the shared supplier CSV^)
    echo  - STAGE3_URL           ^(only if Stage 3 runs somewhere other than http://localhost:5173^)
    echo  - DASHBOARD_PIN
    echo  - OPENROUTER_API_KEY   ^(for invoice extraction^)
    echo.
) else (
    echo backend\.env already exists, skipping.
    echo.
)

:: Create staff_names.txt if it doesn't exist
if not exist staff_names.txt (
    copy staff_names.example.txt staff_names.txt
    echo Created backend\staff_names.txt from staff_names.example.txt
    echo  IMPORTANT: Edit backend\staff_names.txt with your real staff list ^(one name per line^).
    echo.
) else (
    echo backend\staff_names.txt already exists, skipping.
    echo.
)

cd ..

:: Frontend setup
echo [3/3] Installing frontend dependencies...
cd frontend
call npm install
cd ..
echo Done.
echo.

echo =============================================
echo   Setup complete!
echo.
echo   Next steps:
echo   1. Edit backend\.env with your settings ^(if just created^)
echo   2. Double-click start.bat to run the app
echo =============================================
pause
