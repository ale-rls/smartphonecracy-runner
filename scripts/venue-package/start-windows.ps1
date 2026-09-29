param([switch]$InstallStartup)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'focus-edge.ps1')
Set-Location $PSScriptRoot

if ($InstallStartup) {
  $startup = [Environment]::GetFolderPath('Startup')
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut((Join-Path $startup 'Smartphonocracy Venue.lnk'))
  $shortcut.TargetPath = Join-Path $PSScriptRoot 'START-WINDOWS.cmd'
  $shortcut.WorkingDirectory = $PSScriptRoot
  $shortcut.WindowStyle = 7
  $shortcut.Save()
  Write-Host 'Installed: the player and fullscreen Edge start at Windows sign-in for this user.'
  Write-Host 'Keep this installation folder in its current location.'
  Write-Host 'To undo: press Win+R, enter shell:startup, and delete Smartphonocracy Venue.'
  exit 0
}

$mutex = New-Object System.Threading.Mutex($false, 'Local\SmartphonocracyVenuePlayer')
$ownsMutex = $false
$player = $null
try {
  try { $ownsMutex = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
  if (!$ownsMutex) { Write-Host 'The venue launcher is already running.'; exit 0 }
  $node = Join-Path $PSScriptRoot 'runtime\node.exe'
  if (!(Test-Path -LiteralPath $node)) { $node = (Get-Command node -ErrorAction Stop).Source }
  $version = & $node -p 'process.versions.node'
  if ($LASTEXITCODE -ne 0 -or [int]($version.Split('.')[0]) -lt 22) { throw 'Install Node.js 22 or newer, then start again.' }
  $edge = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (!$edge) { throw 'Microsoft Edge was not found. Install Edge, then start again.' }
  $port = if ($env:PORT) { [int]$env:PORT } else { 3000 }
  $url = "http://localhost:$port/display/?sound=1"
  $logs = Join-Path $PSScriptRoot 'logs'
  New-Item -ItemType Directory -Force -Path $logs | Out-Null
  $edgeProfile = Join-Path $env:LOCALAPPDATA 'Smartphonocracy\EdgeProfile'
  $browserOpened = $false
  Write-Host 'Starting venue player. Edge will open automatically when the show server is ready.'
  Write-Host 'Keep this window open (it can be minimized). Ctrl+C stops the player; Alt+F4 closes Edge.'
  while ($true) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $player = Start-Process -FilePath $node -ArgumentList @('"' + (Join-Path $PSScriptRoot 'player.mjs') + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs "$stamp.log") -RedirectStandardError (Join-Path $logs "$stamp.err.log")
    while (!$player.HasExited) {
      if (!$browserOpened) {
        $ready = $false
        try {
          $health = Invoke-RestMethod "http://localhost:$port/healthz" -TimeoutSec 3
          $status = Invoke-RestMethod "http://localhost:$port/api/status" -TimeoutSec 10
          $ready = $health.role -eq 'venue-player' -and $status.ready -eq $true
        } catch { }
        $player.Refresh()
        if ($ready -and !$player.HasExited) {
          Start-Process -FilePath $edge -WindowStyle Normal -ArgumentList @('--kiosk', $url, '--edge-kiosk-type=fullscreen', '--no-first-run', '--autoplay-policy=no-user-gesture-required', ('--user-data-dir="' + $edgeProfile + '"')) | Out-Null
          Focus-VenueEdge -ProfilePath $edgeProfile
          $browserOpened = $true
        }
      }
      Start-Sleep -Seconds 2
      $player.Refresh()
    }
    Write-Host 'Player stopped. Retrying in 5 seconds; diagnostic logs are in the logs folder.'
    Start-Sleep -Seconds 5
  }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
} finally {
  if ($null -ne $player -and !$player.HasExited) { Stop-Process -Id $player.Id -ErrorAction SilentlyContinue }
  if ($ownsMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
