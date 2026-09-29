param([switch]$Update, [string]$MediaDir)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (!(Test-Path -LiteralPath '.env.venue')) {
  Copy-Item 'scripts/venue.env.example' '.env.venue'
  throw 'Created .env.venue. Set its DISPLAY_TOKEN to the live venue server token, then run this script again.'
}
if ($Update) {
  $changes = & git status --porcelain --untracked-files=no
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect Git status.' }
  if ($changes) { throw 'Tracked files have local changes. Resolve them before updating; nothing was overwritten.' }
  & git pull --ff-only
  if ($LASTEXITCODE -ne 0) { throw 'Git update failed. Resolve the reported problem before rebuilding.' }
}
& pnpm.cmd install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& pnpm.cmd venue:build
if ($LASTEXITCODE -ne 0) { throw 'Display build failed. Do not restart until the build succeeds.' }
# The small installation credits ship with Git; the other venue films stay local.
if ([string]::IsNullOrWhiteSpace($MediaDir)) { $MediaDir = Join-Path (Get-Location).Path 'venue-media' }
if (Test-Path -LiteralPath $MediaDir -PathType Container) {
  $creditsSource = Join-Path (Get-Location).Path 'apps/display/src/assets/smartphonocracy-credits-installation.mp4'
  $creditsTarget = Join-Path $MediaDir 'smartphonocracy-credits.mp4'
  $sourceHash = (Get-FileHash -LiteralPath $creditsSource -Algorithm SHA256).Hash
  $manifest = Get-Content -LiteralPath 'content/media-manifests/venue.json' -Raw | ConvertFrom-Json
  $expectedCredits = $manifest.files | Where-Object { $_.src -eq 'smartphonocracy-credits.mp4' }
  if (!$expectedCredits -or $sourceHash -ne $expectedCredits.hash) { throw 'Bundled credits do not match the venue manifest. Do not restart the player.' }
  if (!(Test-Path -LiteralPath $creditsTarget) -or (Get-FileHash -LiteralPath $creditsTarget -Algorithm SHA256).Hash -ne $sourceHash) {
    Copy-Item -LiteralPath $creditsSource -Destination $creditsTarget -Force
    Write-Host "Updated installation credits: $creditsTarget"
  }
} else {
  Write-Host "Media folder not found: $MediaDir. Copy the venue films there, then rerun setup to install the new credits."
}
Write-Host 'Ready. Start scripts/start-venue.ps1 -OpenBrowser, or start the installed venue scheduled task.'
