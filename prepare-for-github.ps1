# PowerShell script to prepare AgroCloud project for GitHub upload
# This script creates a clean version ready for GitHub

Write-Host "Preparing AgroCloud project for GitHub..." -ForegroundColor Green

# Create a temporary directory for the clean version
$cleanDir = "AgroCloud-GitHub-Ready"
if (Test-Path $cleanDir) {
    Remove-Item $cleanDir -Recurse -Force
}
New-Item -ItemType Directory -Path $cleanDir | Out-Null

Write-Host "Created clean directory: $cleanDir" -ForegroundColor Yellow

# Copy essential files and directories (excluding files from .gitignore)
$filesToCopy = @(
    "src",
    "public", 
    "config",
    "server",
    ".github",
    ".vscode",
    "docs",
    "e2e",
    "scripts",
    "tests",
    "analysis_engine",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vite.config.ts",
    "playwright.config.ts",
    "README.md",
    ".gitignore",
    ".env.example",
    "docker-compose.yml",
    "Dockerfile",
    "index.html",
    "agro.json",
    "layer.json",
    "db_migration.sql",
    "test_stac.js",
    "agro-structures-data-entry.html",
    "DataSource_Advanced_Layer_Technical_Docs.md"
)

foreach ($item in $filesToCopy) {
    if (Test-Path $item) {
        if (Test-Path $item -PathType Container) {
            # It's a directory
            Copy-Item $item -Destination $cleanDir -Recurse -Force
            Write-Host "Copied directory: $item" -ForegroundColor Cyan
        } else {
            # It's a file
            Copy-Item $item -Destination $cleanDir -Force
            Write-Host "Copied file: $item" -ForegroundColor Cyan
        }
    } else {
        Write-Host "Skipped (not found): $item" -ForegroundColor Gray
    }
}

Write-Host "`nProject prepared successfully!" -ForegroundColor Green
Write-Host "Clean project is in: $cleanDir" -ForegroundColor Yellow
Write-Host "`nNext steps:" -ForegroundColor White
Write-Host "1. Go to https://github.com and create a new repository named 'AgroCloud'" -ForegroundColor White
Write-Host "2. Upload the contents of the '$cleanDir' folder to your new repository" -ForegroundColor White
Write-Host "3. Or use GitHub Desktop to publish the '$cleanDir' folder" -ForegroundColor White

# Show directory size
$size = (Get-ChildItem $cleanDir -Recurse | Measure-Object -Property Length -Sum).Sum
$sizeMB = [math]::Round($size / 1MB, 2)
Write-Host "`nPrepared project size: $sizeMB MB" -ForegroundColor Green