# Delineate Anything — local start (Windows / no Docker).
# Default: http://127.0.0.1:8096
#
#   .\start-local.ps1
# Model keys: v2 | large_v2 (DelineateAnythingv2.pt) | small | large | fbis22m (v1)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$port = if ($env:PORT) { [int]$env:PORT } else { 8096 }
$env:DELINEATE_MODEL = if ($env:DELINEATE_MODEL) { $env:DELINEATE_MODEL } else { "v2" }
$env:DELINEATE_SKIP_WARMUP = if ($env:DELINEATE_SKIP_WARMUP) { $env:DELINEATE_SKIP_WARMUP } else { "1" }

$candidates = @(
  (Join-Path $Root '.venv\Scripts\python.exe'),
  (Join-Path $Root '..\agri-field-boundary\.venv312\Scripts\python.exe'),
  (Join-Path $Root '..\agri-field-boundary\.venv\Scripts\python.exe'),
  (Join-Path $Root '..\segformer-detection\.venv\Scripts\python.exe'),
  (Join-Path $Root '..\geoai-inference\.venv\Scripts\python.exe')
)
$py = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $py) { Write-Error "No Python venv with torch found. Create .venv and pip install -r requirements.txt" }

Write-Host "Delineate Anything → http://127.0.0.1:$port  model=$($env:DELINEATE_MODEL)"
Write-Host "Using: $py"

& $py -c "import ultralytics, fastapi, cv2, PIL" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Installing requirements…"
  & $py -m pip install -r (Join-Path $Root 'requirements.txt')
}

& $py -m uvicorn app:app --host 127.0.0.1 --port $port --app-dir $Root
