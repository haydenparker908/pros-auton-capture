#Requires -Version 5.1
<#
.SYNOPSIS
  Close any running brain terminals, build+upload, capture serial output to brain-logs/,
  and stop when auton finishes ([auton] done).

.NOTES
  Bound via the "PROS: Capture Auton" VS Code/Cursor task (Ctrl+Alt+A by default).
#>
[CmdletBinding()]
param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$StopPattern = "[auton] done",
  [int]$TimeoutSec = 180,
  [string]$BenchButton = "X",
  [string]$BenchLabel = "match auton",
  [int]$Slot = 5,
  [string]$MakeExtra = "",
  [string]$LogDir = "brain-logs"
)

$ErrorActionPreference = "Stop"
Set-Location $ProjectRoot

function Get-ProsInstallRoot {
  $candidates = @(
    (Join-Path $env:APPDATA "Cursor\User\globalStorage\sigbots.pros\install"),
    (Join-Path $env:APPDATA "Code\User\globalStorage\sigbots.pros\install")
  )
  foreach ($root in $candidates) {
    $cli = Join-Path $root "pros-cli-windows\pros.exe"
    if (Test-Path -LiteralPath $cli) { return $root }
  }
  return $null
}

function Initialize-ProsEnvironment {
  $installRoot = Get-ProsInstallRoot
  if (-not $installRoot) {
    if (Get-Command pros -ErrorAction SilentlyContinue) {
      Write-Host "Using pros from PATH (no one-click install root found)"
      return (Get-Command pros).Source
    }
    throw "pros CLI not found. Open PROS sidebar -> Integrated Terminal once so the CLI/toolchain install."
  }

  $cliDir = Join-Path $installRoot "pros-cli-windows"
  $pros = Join-Path $cliDir "pros.exe"
  # Matches sigbots.pros extension: PROS_TOOLCHAIN = .../pros-toolchain-windows/usr
  $toolchainUsr = Join-Path $installRoot "pros-toolchain-windows\usr"
  $toolchainBin = Join-Path $toolchainUsr "bin"
  $vexcomDir = Join-Path $installRoot "vex-vexcom-windows"

  if (-not (Test-Path -LiteralPath $pros)) {
    throw "pros.exe missing at $pros"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $toolchainBin "make.exe"))) {
    throw "PROS toolchain make.exe not found at $toolchainBin. Reinstall via PROS extension."
  }

  $env:PROS_TOOLCHAIN = $toolchainUsr
  $env:LC_ALL = "en_US.utf-8"
  $env:PATH = ($cliDir, $toolchainBin, $vexcomDir, $env:PATH) -join ";"

  Write-Host "PROS_TOOLCHAIN=$env:PROS_TOOLCHAIN"
  return $pros
}

function Stop-ProsTerminalProcesses {
  Write-Host "==> Closing existing brain / pros terminal processes..."
  $killed = 0
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match 'pros' -and
      $_.CommandLine -match 'terminal'
    } |
    ForEach-Object {
      try {
        Write-Host "    stopping PID $($_.ProcessId): $($_.Name)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        $killed++
      } catch {}
    }

  if ($killed -eq 0) {
    Write-Host "    (none running)"
  } else {
    Start-Sleep -Milliseconds 500
  }
}

function New-BrainLogPaths {
  $logDir = Join-Path $ProjectRoot $LogDir
  if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
  }

  $stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
  $archive = Join-Path $logDir "$stamp.txt"
  $latest = Join-Path $logDir "latest.txt"
  return [pscustomobject]@{
    Dir = $logDir
    Archive = $archive
    Latest = $latest
  }
}

function Invoke-Pros {
  param(
    [Parameter(Mandatory = $true)][string]$ProsExe,
    [Parameter(Mandatory = $true)][string[]]$ProsArgs
  )
  Write-Host ("==> pros {0}" -f ($ProsArgs -join " "))
  $p = Start-Process -FilePath $ProsExe -ArgumentList $ProsArgs -WorkingDirectory $ProjectRoot `
    -NoNewWindow -Wait -PassThru
  if ($p.ExitCode -ne 0) {
    throw ("pros {0} failed with exit code {1}" -f ($ProsArgs -join " "), $p.ExitCode)
  }
}

$pros = Initialize-ProsEnvironment
Write-Host "Using pros: $pros"

Stop-ProsTerminalProcesses

Write-Host ("==> Building and uploading (slot {0}, then auto-run)..." -f $Slot)
# Touch main so EXTRA_CXXFLAGS (match vs AUTON_SKILLS) always recompiles.
$mainCpp = Join-Path $ProjectRoot "src\main.cpp"
if (Test-Path -LiteralPath $mainCpp) {
  (Get-Item -LiteralPath $mainCpp).LastWriteTime = Get-Date
}

$muArgs = [System.Collections.Generic.List[string]]@(
  "mu", "--slot", "$Slot", "--after", "run", "--no-analytics"
)
if ($MakeExtra -and $MakeExtra.Trim().Length -gt 0) {
  $muArgs.Add("--make")
  $muArgs.Add($MakeExtra.Trim())
  Write-Host ("    make extra: {0}" -f $MakeExtra.Trim())
}
Invoke-Pros -ProsExe $pros -ProsArgs $muArgs.ToArray()

Write-Host "==> Waiting for V5 to leave download channel..."
Start-Sleep -Seconds 3

$logs = New-BrainLogPaths
# Truncate latest so we do not match a previous run's "[auton] done"
"" | Set-Content -Path $logs.Latest -Encoding ascii

Write-Host "==> Capturing brain output -> $($logs.Latest)"
Write-Host "    archive: $($logs.Archive)"
Write-Host "    stop when output contains: $StopPattern"
Write-Host ("    timeout {0} sec" -f $TimeoutSec)

$termErr = Join-Path $logs.Dir "terminal-stderr.txt"
if (Test-Path $termErr) { Remove-Item $termErr -Force }
$termArgs = @("terminal", "--no-banner", "--output", $logs.Latest, "--no-analytics")
$proc = Start-Process -FilePath $pros -ArgumentList $termArgs -PassThru -NoNewWindow `
  -WorkingDirectory $ProjectRoot -RedirectStandardError $termErr

# --output is buffered, so do not require the file to contain "Established...".
# Connected = process still alive briefly with no controller/brain link error on stderr.
$startedAt = Get-Date
$connectDeadline = $startedAt.AddSeconds(6)
$connected = $false
$linkError = $false
while ((Get-Date) -lt $connectDeadline) {
  if (Test-Path $termErr) {
    $errText = Get-Content -Path $termErr -Raw -ErrorAction SilentlyContinue
    if ($errText -and $errText -match "doesn.?t appear to be connected") {
      $linkError = $true
      break
    }
  }
  if ($proc.HasExited) {
    $linkError = $true
    break
  }
  if (((Get-Date) - $startedAt).TotalSeconds -ge 1.5) {
    $connected = $true
    break
  }
  Start-Sleep -Milliseconds 200
}

if ($linkError -or -not $connected -or $proc.HasExited) {
  Write-Host "==> Brain terminal failed to connect."
  Write-Host "    Upload used the controller, but serial terminal needs a live brain link."
  Write-Host "    Plug USB into the BRAIN (or ensure controller is linked), then retry."
  if (Test-Path $termErr) {
    Get-Content -Path $termErr -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "    $_" }
  }
  if ($proc -and -not $proc.HasExited) {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
  exit 1
}

Write-Host ""
Write-Host "****************************************"
Write-Host ("***  PRESS {0} ON CONTROLLER NOW!     ***" -f $BenchButton)
Write-Host ("***  (bench: {0})                   ***" -f $BenchLabel)
Write-Host "****************************************"
Write-Host ""

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$seenDone = $false
$timedOut = $false

try {
  while (-not $proc.HasExited) {
    if (Test-Path $logs.Latest) {
      $content = Get-Content -Path $logs.Latest -Raw -ErrorAction SilentlyContinue
      if ($content -and $content.Contains($StopPattern)) {
        Write-Host "==> Detected stop pattern - stopping terminal"
        $seenDone = $true
        break
      }
    }
    if ((Get-Date) -gt $deadline) {
      Write-Host ("==> Timeout ({0} sec) - stopping terminal" -f $TimeoutSec)
      $timedOut = $true
      break
    }
    Start-Sleep -Milliseconds 250
  }
} finally {
  if ($proc -and -not $proc.HasExited) {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
    Stop-ProsTerminalProcesses
  }
}

# Wait briefly so ExitCode is populated
if (-not $proc.HasExited) {
  $proc.WaitForExit(2000) | Out-Null
}
$termExit = $proc.ExitCode

if (Test-Path $logs.Latest) {
  Copy-Item -Path $logs.Latest -Destination $logs.Archive -Force
  Write-Host "==> Saved $($logs.Archive)"
} else {
  Write-Host "==> WARNING: no output file was created"
}

if ($seenDone) {
  Write-Host "==> Auton capture complete"
  exit 0
}

if ($timedOut) {
  Write-Host "==> Timed out waiting for '$StopPattern'."
  Write-Host "    Start auton on the brain after 'Capturing' appears."
  exit 3
}

if ($termExit -ne 0 -and $termExit -ne $null) {
  Write-Host "==> Brain terminal exited early (exit $termExit) before auton finished."
  Write-Host "    Usually the controller/brain serial link failed - plug into the brain (or link controller), then retry."
  Write-Host "    This does NOT mean auton ran; start auton only after you see 'Capturing'."
  exit 1
}

Write-Host "==> Capture ended without seeing '$StopPattern' (terminal closed)."
Write-Host "    Start auton on the brain after 'Capturing' appears, or check the brain USB connection."
exit 2
