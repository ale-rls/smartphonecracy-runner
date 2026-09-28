param(
  [string]$MediaDir,
  [string]$ServerUrl = 'https://smartphonocracy-venue-server.enabler.space',
  [int]$Port = 3000,
  [switch]$OpenBrowser
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
$env:MEDIA_DIR = $MediaDir
$env:VENUE_SERVER_URL = $ServerUrl
$env:PORT = "$Port"
Write-Host "Using local venue media: $MediaDir"
$logDir = Join-Path $env:LOCALAPPDATA 'Smartphonocracy'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$browserOpened = $false
while ($true) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $process = Start-Process -FilePath $node -ArgumentList @('--import','tsx','scripts/serve-venue-display.mts') -PassThru -NoNewWindow -RedirectStandardOutput "$logDir\player-$stamp.log" -RedirectStandardError "$logDir\player-$stamp.err.log"
  try {
    if ($OpenBrowser -and !$browserOpened) {
      while (!$process.HasExited) {
        try {
          Invoke-WebRequest "http://localhost:$Port/healthz" -UseBasicParsing -TimeoutSec 2 | Out-Null
          Invoke-WebRequest "$ServerUrl/api/status" -UseBasicParsing -TimeoutSec 5 | Out-Null
          $edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
          if (!(Test-Path $edge)) { $edge = Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe' }
          Start-Process $edge -ArgumentList @('--kiosk',"http://localhost:$Port/display/?sound=1",'--edge-kiosk-type=fullscreen','--no-first-run','--autoplay-policy=no-user-gesture-required')
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
