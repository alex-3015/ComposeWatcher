# ComposeWatcher – Build & Run Script
# Run this from PowerShell in the project directory:
#   .\build-and-run.ps1

param(
    [string]$DockerFolder = "",
    [switch]$StopOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ComposeFile = Join-Path $PSScriptRoot "docker-compose.yml"

# ── Stop ─────────────────────────────────────────────────────────────────────
if ($StopOnly) {
    Write-Host "[*] Stopping containers..." -ForegroundColor Yellow
    docker compose -f $ComposeFile down
    exit 0
}

# ── Validate docker ───────────────────────────────────────────────────────────
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker not found. Please install Docker Desktop: https://www.docker.com/products/docker-desktop/"
    exit 1
}

# ── Docker folder ─────────────────────────────────────────────────────────────
if (-not $DockerFolder) {
    Write-Host ""
    Write-Host "Enter the path to your docker-compose folder" -ForegroundColor Cyan
    Write-Host "  Example: C:\docker  or  D:\server\docker" -ForegroundColor DarkGray
    $DockerFolder = Read-Host "Docker folder"
}

if (-not (Test-Path $DockerFolder)) {
    Write-Error "Path does not exist: $DockerFolder"
    exit 1
}

# ── Patch docker-compose.yml with the real path ───────────────────────────────
$Content    = Get-Content $ComposeFile -Raw
$Escaped    = $DockerFolder.Replace('\', '/')
$NewContent = $Content -replace '/your/docker/folder', $Escaped
Set-Content $ComposeFile $NewContent -NoNewline
Write-Host "[✓] docker-compose.yml updated with: $DockerFolder" -ForegroundColor Green

# ── Build ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[*] Building Docker images (this may take a few minutes)..." -ForegroundColor Yellow
docker compose -f $ComposeFile build --no-cache

# ── Export image as .tar ───────────────────────────────────────────────────────
$DistDir = Join-Path $PSScriptRoot "dist"
if (-not (Test-Path $DistDir)) { New-Item -ItemType Directory -Path $DistDir | Out-Null }
$TarPath = Join-Path $DistDir "composewatcher.tar"
Write-Host ""
Write-Host "[*] Exporting image to $TarPath ..." -ForegroundColor Yellow
docker save composewatcher -o $TarPath
Write-Host "[✓] Image exported: $TarPath" -ForegroundColor Green

# ── Start ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[*] Starting services..." -ForegroundColor Yellow
docker compose -f $ComposeFile up -d

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ComposeWatcher is running!" -ForegroundColor Green
Write-Host "  Open: http://localhost:8555" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor DarkGray
Write-Host "  View logs:   docker compose logs -f" -ForegroundColor DarkGray
Write-Host "  Stop:        .\build-and-run.ps1 -StopOnly" -ForegroundColor DarkGray
