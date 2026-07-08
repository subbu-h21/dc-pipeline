@echo off
echo Starting DC Pipeline...

:: Build frontend (runs synchronously — ~30s)
echo Building frontend...
pushd frontend
call npm run build
popd

:: Start backend (serves API + built frontend on port 3002)
start "Backend" cmd /k "cd backend && venv\Scripts\activate && python main.py"

:: Open browser once backend is ready
powershell -NoProfile -Command "do { Start-Sleep 1 } until ((Test-NetConnection localhost -Port 3002 -InformationLevel Quiet -WarningAction SilentlyContinue)); Start-Process 'http://localhost:3002'"
