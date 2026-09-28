param(
  [string]$MediaDir,
  [string]$ServerUrl
)
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'start-venue.ps1'
$repoDir = Split-Path $PSScriptRoot -Parent
if ([string]::IsNullOrWhiteSpace($MediaDir)) { $MediaDir = Join-Path $repoDir 'venue-media' }
if (!(Test-Path -LiteralPath $MediaDir -PathType Container)) {
  throw "Venue media folder not found: $MediaDir. Copy the supplied video folder to '$repoDir\venue-media', or pass -MediaDir with its location."
}
$MediaDir = (Resolve-Path -LiteralPath $MediaDir).Path
$who = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -MediaDir "{1}" -OpenBrowser' -f $script,$MediaDir
if ($ServerUrl) { $arguments += ' -ServerUrl "{0}"' -f $ServerUrl }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory (Split-Path $PSScriptRoot -Parent)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $who
$principal = New-ScheduledTaskPrincipal -UserId $who -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Smartphonocracy Venue Player' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host 'Installed: starts at Windows sign-in and restarts after failure.'
Write-Host 'Start now: Start-ScheduledTask -TaskName "Smartphonocracy Venue Player"'
