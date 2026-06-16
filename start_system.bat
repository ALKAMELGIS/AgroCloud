@echo off
cd /d "%~dp0"
echo ==========================================
echo      Agri Cloud System - Dev Startup
echo ==========================================
echo.
echo [1/3] Checking environment...
if not exist node_modules (
    echo Node modules not found. Installing...
    call npm.cmd install
)

echo.
echo [2/3] Starting Frontend + Backend (dev mode, LAN-friendly)...
call node scripts\print-dev-urls.mjs
echo.
echo [3/3] Running (auto dev watch)...
echo Keep this window open. Other devices: use the LAN URL above (same Wi-Fi).
echo If blocked, allow Node.js in Windows Firewall.
echo.
call npm.cmd run dev:clean