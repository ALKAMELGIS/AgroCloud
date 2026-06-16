# Publish this repo to GitHub using HTTPS (avoids SSH publickey errors on Windows).
# Usage: from repo root, run:  powershell -ExecutionPolicy Bypass -File .\publish-to-github.ps1
# Optional commit message: powershell -ExecutionPolicy Bypass -File .\publish-to-github.ps1 -CommitMessage "Your message"

param(
  [string]$CommitMessage = "chore: update project files"
)

$ErrorActionPreference = 'Stop'
$HttpsOrigin = 'https://github.com/ALKAMELGIS/AgroCloud.git'

Write-Host "Configuring origin to HTTPS (add if missing, update if exists)..." -ForegroundColor Cyan
$originExists = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0 -and $originExists) {
  git remote set-url origin $HttpsOrigin
  Write-Host "Updated existing origin remote." -ForegroundColor Green
} else {
  git remote add origin $HttpsOrigin
  Write-Host "Added origin remote." -ForegroundColor Green
}

$rewrite = git config --global --get-regexp 'insteadOf' 2>$null
if ($rewrite) {
  Write-Host "Warning: global Git url.insteadOf rules found (can force SSH over HTTPS):" -ForegroundColor Yellow
  $rewrite | ForEach-Object { Write-Host "  $_" }
  Write-Host "If push still uses SSH, run: git config --global --edit  and remove those url.* lines." -ForegroundColor Yellow
}

Write-Host "origin is now:" -ForegroundColor Green
git remote -v

# Avoid HTTP 408 / "RPC failed" / unexpected disconnect on slow or large HTTPS pushes (Windows/curl).
Write-Host "`nTuning HTTP for reliable push (postBuffer + HTTP/1.1 + schannel)..." -ForegroundColor Cyan
git config --local http.postBuffer 524288000
git config --local http.version HTTP/1.1
git config --local http.sslBackend schannel

Write-Host "`nPreparing commit (only if there are changes)..." -ForegroundColor Cyan
git add -A
$hasChanges = git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m $CommitMessage
  Write-Host "Committed local changes." -ForegroundColor Green
} else {
  Write-Host "No changes to commit. Continuing to push." -ForegroundColor Yellow
}

Write-Host "`nPushing main to origin (browser login may open for GitHub)..." -ForegroundColor Cyan
git push -u origin main
