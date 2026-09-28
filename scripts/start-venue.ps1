param(
  [string]$MediaDir,
  [string]$ServerUrl,
  [int]$Port = 3000,
  [switch]$OpenBrowser,
  [switch]$UseLiveDisplay
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$repoDir = (Get-Location).Path
if ([string]::IsNullOrWhiteSpace($MediaDir)) { $MediaDir = Join-Path $repoDir 'venue-media' }
if (!(Test-Path -LiteralPath $MediaDir -PathType Container)) {
  throw "Venue media folder not found: $MediaDir. Copy the supplied video folder to '$repoDir\venue-media', or pass -MediaDir with its location."
}
$MediaDir = (Resolve-Path -LiteralPath $MediaDir).Path
$node = (Get-Command node -ErrorAction Stop).Source
if (!$UseLiveDisplay -and !(Test-Path -LiteralPath 'apps/display/dist/index.html')) {
  throw 'Local display build missing. Run scripts/setup-venue.ps1 first.'
}
$env:MEDIA_DIR = $MediaDir
if ($ServerUrl) { $env:VENUE_SERVER_URL = $ServerUrl }
$env:VENUE_DISPLAY_DIR = if ($UseLiveDisplay) { '' } else { Join-Path $repoDir 'apps/display/dist' }
$env:PORT = "$Port"
Write-Host "Using local venue media: $MediaDir"
$logDir = Join-Path $env:LOCALAPPDATA 'Smartphonocracy'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$browserOpened = $false
$edge = $null
if ($OpenBrowser) {
  $edge = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (!$edge) { throw 'Microsoft Edge was not found. Install it before starting the venue display.' }
}
$nodeArgs = @('--import', 'tsx')
if (Test-Path -LiteralPath '.env.venue') { $nodeArgs += '--env-file=.env.venue' }
$nodeArgs += 'scripts/serve-venue-display.mts'
while ($true) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $process = Start-Process -FilePath $node -ArgumentList $nodeArgs -PassThru -NoNewWindow -RedirectStandardOutput "$logDir\player-$stamp.log" -RedirectStandardError "$logDir\player-$stamp.err.log"
  try {
    if ($OpenBrowser -and !$browserOpened) {
      while (!$process.HasExited) {
        try {
          Invoke-WebRequest "http://localhost:$Port/healthz" -UseBasicParsing -TimeoutSec 2 | Out-Null
          $status = Invoke-RestMethod "http://localhost:$Port/api/status" -TimeoutSec 10
          if (!$status.ready) { Start-Sleep -Seconds 2; continue }
          $edgeProfile = Join-Path $env:LOCALAPPDATA 'Smartphonocracy\EdgeProfile'
          Start-Process $edge -ArgumentList @('--kiosk',"http://localhost:$Port/display/?sound=1",'--edge-kiosk-type=fullscreen','--no-first-run','--autoplay-policy=no-user-gesture-required', ('--user-data-dir="' + $edgeProfile + '"'))
          $browserOpened = $true
          break
        } catch { Start-Sleep -Seconds 2 }
      }
    }
    $process.WaitForExit()
  } finally {
    if (!$process.HasExited) { Stop-Process -Id $process.Id }
  }
  Write-Host 'Venue player stopped; restarting in 5 seconds. Close this window to stop.'
  Start-Sleep -Seconds 5
}
