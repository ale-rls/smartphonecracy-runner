# Shared by the source checkout and portable Windows delivery.
function Focus-VenueEdge {
  param([Parameter(Mandatory = $true)][string]$ProfilePath)
  if (-not ('VenueWindowFocus' -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class VenueWindowFocus {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr window, int command);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
}
'@
  }
  $shell = New-Object -ComObject WScript.Shell
  $stable = 0
  # Edge can hand launch off to an existing process. Find only our dedicated
  # profile, then wait for its actual window instead of using the launch PID.
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $candidates = Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" | Where-Object {
      $_.CommandLine -and $_.CommandLine.IndexOf($ProfilePath, [StringComparison]::OrdinalIgnoreCase) -ge 0
    }
    $focused = $false
    foreach ($candidate in $candidates) {
      $browser = Get-Process -Id $candidate.ProcessId -ErrorAction SilentlyContinue
      if (!$browser -or $browser.MainWindowHandle -eq [IntPtr]::Zero) { continue }
      $handle = $browser.MainWindowHandle
      if ([VenueWindowFocus]::GetForegroundWindow() -ne $handle) {
        if ([VenueWindowFocus]::IsIconic($handle)) { [void][VenueWindowFocus]::ShowWindowAsync($handle, 9) }
        [void]$shell.AppActivate([int]$browser.Id)
        # Raise above the startup console, then immediately release topmost
        # so operators can still switch apps after launch.
        [void][VenueWindowFocus]::SetWindowPos($handle, [IntPtr](-1), 0, 0, 0, 0, 0x43)
        [void][VenueWindowFocus]::SetWindowPos($handle, [IntPtr](-2), 0, 0, 0, 0, 0x43)
        [void][VenueWindowFocus]::SetForegroundWindow($handle)
      }
      if ([VenueWindowFocus]::GetForegroundWindow() -eq $handle) { $focused = $true; break }
    }
    if ($focused) { $stable++ } else { $stable = 0 }
    if ($stable -ge 3) { Write-Host 'Venue Edge window is in the foreground.'; return }
    Start-Sleep -Seconds 1
  }
  Write-Warning 'Edge did not confirm foreground focus within 30 seconds. Select the venue Edge window with Alt+Tab.'
}
