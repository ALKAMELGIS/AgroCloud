# Start Agri Field Boundary (:8092) and auto-restart if the process exits.
# AgroCloud proxies /api/agri-field-boundary -> http://127.0.0.1:8092
#
# Usage:
#   .\start-local.ps1
# Optional:
#   $env:PORT = "8092"; .\start-local.ps1
# Disable auto-restart:
#   $env:AFB_NO_RESTART = "1"; .\start-local.ps1

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$port = if ($env:PORT) { [int]$env:PORT } else { 8092 }
$autoRestart = -not ($env:AFB_NO_RESTART -in @('1', 'true', 'True', 'yes'))

$candidates = @(
  (Join-Path $here '.venv312\Scripts\python.exe'),
  (Join-Path $here '.venv\Scripts\python.exe'),
  (Join-Path $here '..\segformer-detection\.venv\Scripts\python.exe'),
  (Join-Path $here '..\geoai-inference\.venv\Scripts\python.exe')
)
$py = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $py) {
  Write-Error "No Python venv found. Create one: py -3.12 -m venv .venv312 && .\.venv312\Scripts\pip install -r requirements.txt"
}

$venvScripts = Split-Path -Parent $py
$ftwBin = Join-Path $venvScripts 'ftw.exe'
if (Test-Path $ftwBin) {
  $env:FTW_INFERENCE_BIN = $ftwBin
  if (-not $env:FTW_CHECKPOINT_PATH) {
    $ckpt = Join-Path $here 'models\prue_efnetb7_ccby_checkpoint.ckpt'
    if (Test-Path $ckpt) { $env:FTW_CHECKPOINT_PATH = $ckpt }
  }
}

Write-Host "Agri Field Boundary -> http://127.0.0.1:$port"
Write-Host "Using: $py"
if ($autoRestart) {
  Write-Host "Auto-restart: ON (set AFB_NO_RESTART=1 to disable)"
}

& $py -c "import fastapi, uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Installing fastapi/uvicorn into $py ..."
  & $py -m pip install "fastapi>=0.110" "uvicorn[standard]>=0.29" "python-multipart>=0.0.9"
}

function Test-PortListening([int]$p) {
  try {
    $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    return [bool]$c
  } catch {
    return $false
  }
}

function Test-AfbHealthy([int]$p) {
  try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:$p/health" -UseBasicParsing -TimeoutSec 4
    return ($health.StatusCode -eq 200)
  } catch {
    return $false
  }
}

if (Test-PortListening $port) {
  if (Test-AfbHealthy $port) {
    Write-Host "Already healthy on :$port - leaving existing process running."
    exit 0
  }
  Write-Host "Port $port is busy but /health failed - free the port and retry."
  exit 1
}

do {
  & $py -m uvicorn app:app --host 127.0.0.1 --port $port
  $code = $LASTEXITCODE
  if (-not $autoRestart) { exit $code }
  # Another process may have claimed the port while we were down — do not crash-loop.
  if (Test-AfbHealthy $port) {
    Write-Host "Port :$port became healthy from another process - exiting restart loop."
    exit 0
  }
  Write-Host "uvicorn exited ($code) - restarting in 2s..."
  Start-Sleep -Seconds 2
} while ($true)
