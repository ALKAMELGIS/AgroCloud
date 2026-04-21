@echo off
cd /d "%~dp0"
echo ==========================================
echo      Agri Cloud System - Startup
echo ==========================================
echo.
echo [1/3] Checking environment...
if not exist node_modules (
    echo Node modules not found. Installing...
    call npm.cmd install
)

echo.
echo [2/3] Building frontend for offline use...
call npm.cmd run build

echo.
echo [3/3] Starting Server...
echo The system is now running at http://localhost:3001
echo You can close this window if you are running via the background script.
echo.

node server/index.js