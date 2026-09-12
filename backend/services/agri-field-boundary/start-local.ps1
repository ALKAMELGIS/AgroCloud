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
  Write-Host "No venv found - running setup-local.ps1 ..."
  & (Join-Path $here 'setup-local.ps1')
  $py = (Join-Path $here '.venv312\Scripts\python.exe')
  if (-not (Test-Path $py)) {
    Write-Error "Setup failed. Run .\setup-local.ps1 manually."
  }
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

# AgroDetect S2 fast mode (~30-90s on CPU): B5 + resize 4 + parallel workers + cache.
if (-not $env:FTW_INFER_FAST) { $env:FTW_INFER_FAST = '1' }
if (-not $env:FTW_INFER_MODEL) { $env:FTW_INFER_MODEL = 'FTW_PRUE_EFNET_B5' }
if (-not $env:FTW_INFER_RESIZE_FACTOR) { $env:FTW_INFER_RESIZE_FACTOR = '4' }
if (-not $env:FTW_INFER_BATCH_SIZE) { $env:FTW_INFER_BATCH_SIZE = '2' }
if (-not $env:FTW_INFER_NUM_WORKERS) { $env:FTW_INFER_NUM_WORKERS = '4' }
if (-not $env:FTW_INFER_BUFFER_DAYS) { $env:FTW_INFER_BUFFER_DAYS = '7' }
if (-not $env:FTW_INFER_CACHE_DIR) {
  $env:FTW_INFER_CACHE_DIR = Join-Path $here '.cache\ftw-infer-s2'
}
New-Item -ItemType Directory -Force -Path $env:FTW_INFER_CACHE_DIR | Out-Null

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
    $json = Invoke-RestMethod -Uri "http://127.0.0.1:$p/health" -TimeoutSec 8
    if ($json.status -ne 'ok') { return $false }
    if ($json.ftw_inference_s2 -eq $true) { return $true }
    if ($json.delineate_anything -eq $true) { return $true }
    return $true
  } catch {
    return $false
  }
}

if (Test-PortListening $port) {
  if (Test-AfbHealthy $port) {
    try {
      $ftwOk = (Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -TimeoutSec 8).ftw_inference_s2
      if ($ftwOk -ne $true -and (Test-Path $ftwBin)) {
        Write-Host "Port :$port is up but AgroDetect S2 is not ready - restarting with FTW CLI..."
        Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty OwningProcess -Unique |
          ForEach-Object { if ($_ -and $_ -ne 0) { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }
        Start-Sleep -Seconds 2
      } else {
        Write-Host "Already healthy on :$port (AgroDetect S2 ready=$ftwOk) - leaving process running."
        exit 0
      }
    } catch {
      Write-Host "Already healthy on :$port - leaving existing process running."
      exit 0
    }
  }
  Write-Host "Port $port is busy but /health failed - free the port and retry."
  exit 1
}

do {
  & $py -m uvicorn app:app --host 127.0.0.1 --port $port
  $code = $LASTEXITCODE
  if (-not $autoRestart) { exit $code }
  # Another process may have claimed the port while we were down - do not crash-loop.
  if (Test-AfbHealthy $port) {
    Write-Host "Port :$port became healthy from another process - exiting restart loop."
    exit 0
  }
  Write-Host "uvicorn exited ($code) - restarting in 2s..."
  Start-Sleep -Seconds 2
} while ($true)
