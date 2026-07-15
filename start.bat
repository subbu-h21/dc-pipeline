@echo off
echo Starting DC Pipeline...

:: Build frontend (runs synchronously — ~30s)
echo Building frontend...
pushd frontend
call npm run build
if errorlevel 1 (
    popd
    echo.
    echo  BUILD FAILED — see the error above.
    echo  The backend will NOT be started, since it would just silently
    echo  keep serving the old/stale frontend build instead of this one.
    echo.
    pause
    exit /b 1
)
popd

:: Refuse to start if port 3002 is already occupied — otherwise this script
:: silently opens the browser against whatever is already listening there
:: (e.g. a leftover backend from an earlier run), instead of the fresh one
:: we're about to start, with zero indication anything is wrong.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3002 -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
if errorlevel 1 (
    echo.
    echo  Port 3002 is already in use by another process.
    echo  Close that backend window ^(or end its python.exe process^) first,
    echo  then run start.bat again — otherwise you'll end up looking at the
    echo  OLD backend, not this fresh build.
    echo.
    pause
    exit /b 1
)

:: Start backend (serves API + built frontend on port 3002)
start "Backend" cmd /k "cd backend && venv\Scripts\activate && python main.py"

:: Open browser once backend is ready
powershell -NoProfile -Command "do { Start-Sleep 1 } until ((Test-NetConnection localhost -Port 3002 -InformationLevel Quiet -WarningAction SilentlyContinue)); Start-Process 'http://localhost:3002'"
