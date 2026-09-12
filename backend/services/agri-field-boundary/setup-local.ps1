# One-time / repeat setup for Agri Field Boundary Python (:8092).
# Creates .venv312, installs deps + ftw-tools 2.x (AgroDetect S2), downloads FTW checkpoint.
#
# Usage (from repo root or this folder):
#   .\backend\services\agri-field-boundary\setup-local.ps1

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

function Find-SystemPython {
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "$env:ProgramFiles\Python312\python.exe",
    "$env:ProgramFiles\Python311\python.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
  if ($pyLauncher) {
    & py -3.12 -c "import sys; print(sys.executable)" 2>$null | ForEach-Object {
      if ($_ -and (Test-Path $_)) { return $_ }
    }
  }
  return $null
}

$venvPy = Join-Path $here '.venv312\Scripts\python.exe'
if (-not (Test-Path $venvPy)) {
  $sysPy = Find-SystemPython
  if (-not $sysPy) {
    Write-Host "Python 3.12 not found - installing via winget..."
    winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    $sysPy = Find-SystemPython
  }
  if (-not $sysPy) {
    throw "Install Python 3.12 from https://www.python.org/downloads/ then re-run setup-local.ps1"
  }
  Write-Host "Creating venv with $sysPy ..."
  & $sysPy -m venv (Join-Path $here '.venv312')
}

Write-Host "Installing Python packages (CPU PyTorch + requirements)..."
& $venvPy -m pip install --upgrade pip
& $venvPy -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
& $venvPy -m pip install -r requirements.txt
& $venvPy -m pip install "ftw-tools==2.0.0b5" "geopandas>=0.14"

$ckpt = Join-Path $here 'models\prue_efnetb7_ccby_checkpoint.ckpt'
if (-not (Test-Path $ckpt)) {
  New-Item -ItemType Directory -Force -Path (Join-Path $here 'models') | Out-Null
  $url = 'https://github.com/fieldsoftheworld/ftw-baselines/releases/download/v3/prue_efnet7_checkpoint.ckpt'
  Write-Host "Downloading FTW checkpoint (~270 MB)..."
  Invoke-WebRequest -Uri $url -OutFile $ckpt -UseBasicParsing
}

$ftw = Join-Path $here '.venv312\Scripts\ftw.exe'
& $ftw inference all --help | Select-Object -First 1
Write-Host 'Setup complete. Start the service: .\start-local.ps1'
