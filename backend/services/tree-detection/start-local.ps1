# Start AI Tree Detection locally (DeepForest by default — no Docker required).
# AgroCloud backend proxies to http://127.0.0.1:8080/predict by default.
#
# Usage:
#   .\start-local.ps1
# Optional YOLO:
#   $env:MODEL_PATH = "C:\path\to\best.pt"; $env:TREE_DETECTION_ENGINE = "yolo"; .\start-local.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$port = if ($env:PORT) { [int]$env:PORT } else { 8080 }

$candidates = @(
  (Join-Path $Root '.venv\Scripts\python.exe'),
  (Join-Path $Root 'venv\Scripts\python.exe'),
  # Reuse sibling ML venvs that already include torch (avoids Win long-path install issues).
  (Join-Path $Root '..\agri-field-boundary\.venv312\Scripts\python.exe'),
  (Join-Path $Root '..\segformer-detection\.venv\Scripts\python.exe'),
  (Join-Path $Root '..\geoai-inference\.venv\Scripts\python.exe'),
  "$env:LOCALAPPDATA\AgroCloud\td\Scripts\python.exe"
)

# A partially installed `uvicorn` still imports as an empty namespace package, so
# probe the runnable entry point instead of a bare import.
function Test-ServiceRuntime([string]$exe) {
  # Native stderr must not become a terminating error while probing.
  $ErrorActionPreference = 'SilentlyContinue'
  if (-not (Test-Path $exe)) { return $false }
  & $exe -m uvicorn --version 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { return $false }
  & $exe -c "import fastapi, numpy, PIL" 2>&1 | Out-Null
  return $LASTEXITCODE -eq 0
}

function Test-PyModule([string]$exe, [string]$moduleName) {
  $ErrorActionPreference = 'SilentlyContinue'
  & $exe -c "import $moduleName" 2>&1 | Out-Null
  return $LASTEXITCODE -eq 0
}

$py = $candidates | Where-Object { Test-ServiceRuntime $_ } | Select-Object -First 1
if (-not $py) {
  $py = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $py) {
    Write-Error "No suitable Python found. Create a short-path venv: python -m venv C:\ac\td ; C:\ac\td\Scripts\pip install -r requirements.txt"
  }
  Write-Host "Repairing HTTP deps in $py …"
  & $py -m pip install --upgrade --force-reinstall "fastapi>=0.110" "uvicorn[standard]>=0.29" "pillow>=10" "python-multipart>=0.0.9" "numpy>=1.24"
  if (-not (Test-ServiceRuntime $py)) {
    Write-Error "Python at $py cannot run uvicorn. Recreate the venv: py -3.12 -m venv .venv ; .\.venv\Scripts\pip install -r requirements.txt"
  }
}

Write-Host "Tree-detection service → http://127.0.0.1:$port"
Write-Host "Using: $py"

$hasDeepForest = Test-PyModule $py 'deepforest'
$hasUltralytics = Test-PyModule $py 'ultralytics'

if (-not $env:TREE_DETECTION_ENGINE) {
  if ($hasDeepForest) {
    $env:TREE_DETECTION_ENGINE = 'deepforest'
  } elseif ($hasUltralytics) {
    Write-Host "DeepForest missing — installing (best tree-crown model)…"
    & $py -m pip install "deepforest>=1.4.0"
    if (Test-PyModule $py 'deepforest') {
      $env:TREE_DETECTION_ENGINE = 'deepforest'
      $hasDeepForest = $true
    } else {
      Write-Host "WARNING: DeepForest install failed. YOLO without tree weights will NOT detect crowns well."
      $env:TREE_DETECTION_ENGINE = 'yolo_seg'
    }
  }
}
if (-not $hasDeepForest -and -not $hasUltralytics) {
  Write-Host "Installing deepforest (first run may take several minutes)…"
  & $py -m pip install "deepforest>=1.4.0"
  $env:TREE_DETECTION_ENGINE = 'deepforest'
}

if (-not $env:TREE_DETECTION_IMG_SIZE) { $env:TREE_DETECTION_IMG_SIZE = '800' }
if (-not $env:TREE_DETECTION_CONF) { $env:TREE_DETECTION_CONF = '0.25' }

Write-Host "Engine: $($env:TREE_DETECTION_ENGINE)  imgsz=$($env:TREE_DETECTION_IMG_SIZE)  conf=$($env:TREE_DETECTION_CONF)"
Write-Host "Starting uvicorn on 0.0.0.0:$port …"
& $py -m uvicorn app:app --host 0.0.0.0 --port $port --app-dir $Root
