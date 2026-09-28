param([switch]$Update)
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
Write-Host 'Ready. Start scripts/start-venue.ps1 -OpenBrowser, or start the installed venue scheduled task.'
