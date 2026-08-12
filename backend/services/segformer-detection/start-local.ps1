# Start SegFormer detection (:8095) with a known-good Python that has transformers.
# Prefer local .venv, then geoai-inference .venv.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$candidates = @(
  (Join-Path $here '.venv\Scripts\python.exe'),
  (Join-Path $here '..\geoai-inference\.venv\Scripts\python.exe')
)
$py = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $py) {
  Write-Error "No Python venv found. Create one: py -3.11 -m venv .venv && .\.venv\Scripts\pip install -r requirements.txt"
}

Write-Host "Using $py"
& $py -c "import transformers, uvicorn; print('deps ok', transformers.__version__)"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Installing requirements into $py ..."
  & $py -m pip install -r (Join-Path $here 'requirements.txt')
}

$env:SEGFORMER_MODEL_ID = if ($env:SEGFORMER_MODEL_ID) { $env:SEGFORMER_MODEL_ID } else { 'nvidia/segformer-b0-finetuned-ade-512-512' }
& $py -m uvicorn app:app --host 127.0.0.1 --port 8095
