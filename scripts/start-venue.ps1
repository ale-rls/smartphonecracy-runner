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
  # Supported Edge policy: kiosk mode alone does not suppress translation offers.
  # HKCU affects this Windows user's Edge profiles, not other Windows accounts.
  $edgePolicy = 'HKCU:\Software\Policies\Microsoft\Edge'
  try {
    New-Item -Path $edgePolicy -Force | Out-Null
    New-ItemProperty -Path $edgePolicy -Name 'TranslateEnabled' -PropertyType DWord -Value 0 -Force | Out-Null
    Write-Host 'Edge translation disabled for this Windows user.'
  } catch {
    throw "Cannot disable Edge translation. Ask venue IT to set TranslateEnabled=0. $($_.Exception.Message)"
  }
}
$nodeArgs = @('--import', 'tsx')
if (Test-Path -LiteralPath '.env.venue') { $nodeArgs += '--env-file=.env.venue' }
$nodeArgs += 'scripts/serve-venue-display.mts'
Write-Host "Player logs: $logDir"
if ($OpenBrowser) { Write-Host "Edge: $edge" }
while ($true) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $process = Start-Process -FilePath $node -ArgumentList $nodeArgs -PassThru -NoNewWindow -RedirectStandardOutput "$logDir\player-$stamp.log" -RedirectStandardError "$logDir\player-$stamp.err.log"
  try {
    if ($OpenBrowser -and !$browserOpened) {
      $lastWaitMessage = ''
      while (!$process.HasExited) {
        $ready = $false
        try {
          # The gateway binds IPv4 explicitly. Avoid localhost resolving to ::1.
          $health = Invoke-RestMethod "http://127.0.0.1:$Port/healthz" -TimeoutSec 3
          if ($health.role -ne 'venue-player') { throw "Port $Port is occupied by another service." }
          $status = Invoke-RestMethod "http://127.0.0.1:$Port/api/status" -TimeoutSec 20
          if (!$status.ready) { throw 'The live show server is not ready yet.' }
          $ready = $true
        } catch {
          $message = $_.Exception.Message
          if ($message -ne $lastWaitMessage) {
            Write-Host "Waiting to open Edge: $message"
            $lastWaitMessage = $message
          }
        }
        $process.Refresh()
        if ($ready -and !$process.HasExited) {
          $edgeProfile = Join-Path $env:LOCALAPPDATA 'Smartphonocracy\EdgeProfile'
          Write-Host "Opening Edge at http://localhost:$Port/display/?sound=1"
          # Launch errors must reach the operator, not disappear in the readiness retry.
          Start-Process $edge -ArgumentList @('--kiosk',"http://localhost:$Port/display/?sound=1",'--edge-kiosk-type=fullscreen','--no-first-run','--autoplay-policy=no-user-gesture-required', ('--user-data-dir="' + $edgeProfile + '"'))
          $browserOpened = $true
          break
        }
        Start-Sleep -Seconds 2
        $process.Refresh()
      }
    }
    $process.WaitForExit()
    Write-Host "Venue player exited with code $($process.ExitCode). Latest errors:"
    Get-Content -LiteralPath "$logDir\player-$stamp.err.log" -Tail 20 -ErrorAction SilentlyContinue
  } finally {
    if (!$process.HasExited) { Stop-Process -Id $process.Id }
  }
  Write-Host 'Venue player stopped; restarting in 5 seconds. Close this window to stop.'
  Start-Sleep -Seconds 5
}
