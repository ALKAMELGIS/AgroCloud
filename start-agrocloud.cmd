@echo off
rem ===========================================================================
rem  AgroCloud - run the full system on this Windows computer (production mode).
rem  Double-click this file. First run installs and builds (about 5-10 minutes);
rem  later runs start in seconds. Close this window to stop the system.
rem
rem    start-agrocloud.cmd           start (builds only if needed)
rem    start-agrocloud.cmd rebuild   rebuild the app first (after updating the code)
rem
rem  Data (users, settings, API keys, entries) is kept in .\data\agrocloud.sqlite
rem  Developer mode with hot reload: core\scripts\windows\start_system.bat
rem ===========================================================================
setlocal EnableExtensions
title AgroCloud
cd /d "%~dp0"

set "AGRO_PORT=3011"
if not "%AGROCLOUD_PORT%"=="" set "AGRO_PORT=%AGROCLOUD_PORT%"


rem --- 1. Node.js 22 or newer -------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed. Install Node.js 22 LTS, then run this file again.
  echo   Opening https://nodejs.org/en/download ...
  start "" "https://nodejs.org/en/download"
  goto :fail
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 22 (
  echo   Node.js %NODE_MAJOR% is too old. AgroCloud needs Node.js 22 or newer.
  start "" "https://nodejs.org/en/download"
  goto :fail
)

rem --- Port: use the first free one from %AGRO_PORT% - another program may already use it.
for /f "delims=" %%p in ('node "%~dp0core\scripts\windows\find-free-port.mjs" %AGRO_PORT%') do set "FREE_PORT=%%p"
if not defined FREE_PORT goto :fail
if not "%FREE_PORT%"=="%AGRO_PORT%" echo   Port %AGRO_PORT% is used by another program - using %FREE_PORT% instead.
set "AGRO_PORT=%FREE_PORT%"
echo.
echo   AgroCloud  ^|  http://localhost:%AGRO_PORT%/
echo   ------------------------------------------------------------
echo.

rem --- 2. Dependencies (first run, or after package-lock.json changed) ---------
set "NEED_INSTALL="
if not exist "node_modules\better-sqlite3\package.json" set "NEED_INSTALL=1"
rem Reinstall when package-lock.json is newer than the last install - locale-independent check.
if not defined NEED_INSTALL (
  node -e "const f=require('fs');try{process.exit(f.statSync('package-lock.json').mtimeMs>f.statSync('node_modules/.package-lock.json').mtimeMs?1:0)}catch{process.exit(1)}"
  if errorlevel 1 set "NEED_INSTALL=1"
)
if defined NEED_INSTALL (
  echo   [1/3] Installing dependencies - first run takes a few minutes...
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto :fail
) else (
  echo   [1/3] Dependencies OK
)

rem --- 3. Build the app (first run, or "rebuild") ------------------------------
set "NODE_ENV=production"
set "VITE_BASE_PATH=/"
set "VITE_ELITE_SAME_ORIGIN_API=true"
if /i "%~1"=="rebuild" if exist "frontend\dist" rmdir /s /q "frontend\dist"
if not exist "frontend\dist\index.html" (
  echo   [2/3] Building the app...
  call npm run build:production
  if errorlevel 1 goto :fail
) else (
  echo   [2/3] App build OK   ^(run "start-agrocloud.cmd rebuild" after updating the code^)
)

rem --- 4. Start -----------------------------------------------------------------
rem  Listen on this computer only. Data lives next to this file.
set "HOST=127.0.0.1"
set "PORT=%AGRO_PORT%"
set "AGROCLOUD_DATA_DIR=%~dp0data"
set "FORCE_HTTPS=false"

echo   [3/3] Starting on http://localhost:%AGRO_PORT%/  - keep this window open.
echo.
rem Open the browser once the server answers (up to ~60 s).
start "" /b powershell -NoProfile -WindowStyle Hidden -Command ^
  "$u='http://localhost:%AGRO_PORT%/'; for($i=0;$i -lt 60;$i++){ try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 ($u+'api/health') | Out-Null; Start-Process $u; break } catch { Start-Sleep 1 } }"

node server.js
echo.
echo   AgroCloud stopped.
pause
exit /b 0

:fail
echo.
echo   Could not start AgroCloud. See the messages above.
pause
exit /b 1
