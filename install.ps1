# Install owlsh capture agent (Windows).
#
#   irm https://raw.githubusercontent.com/silofy/owlsh/main/install.ps1 | iex
#
# Downloads the prebuilt binary from the latest GitHub release, verifies it against the release's
# SHA256SUMS, installs it as owlsh.exe and adds its folder to your user PATH. No admin.
#
#   $env:OWLSH_VERSION = "v0.1.0"   install a specific release instead of the latest
#   $env:OWLSH_BIN_DIR = "C:\tools" install somewhere other than %LOCALAPPDATA%\Programs\owlsh
$ErrorActionPreference = "Stop"

$Repo    = "silofy/owlsh"
$Asset   = "owlsh-windows-x86_64.exe"
$Version = if ($env:OWLSH_VERSION) { $env:OWLSH_VERSION } elseif ($env:WATCHER_VERSION) { $env:WATCHER_VERSION } else { "latest" }  # WATCHER_* = pre-rename names
$BinDir  = if ($env:OWLSH_BIN_DIR) { $env:OWLSH_BIN_DIR } elseif ($env:WATCHER_BIN_DIR) { $env:WATCHER_BIN_DIR } else { Join-Path $env:LOCALAPPDATA "Programs\owlsh" }

if (-not [Environment]::Is64BitOperatingSystem) { throw "owlsh install: only 64-bit Windows has a prebuilt binary." }

$Base = if ($Version -eq "latest") { "https://github.com/$Repo/releases/latest/download" }
        else { "https://github.com/$Repo/releases/download/$Version" }

$Tmp = Join-Path ([IO.Path]::GetTempPath()) ("owlsh-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $Tmp | Out-Null
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Write-Host "Downloading $Asset ($Version)..."
  Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset" -OutFile (Join-Path $Tmp $Asset)
  Invoke-WebRequest -UseBasicParsing -Uri "$Base/SHA256SUMS" -OutFile (Join-Path $Tmp "SHA256SUMS")

  $want = $null
  foreach ($line in Get-Content (Join-Path $Tmp "SHA256SUMS")) {
    $parts = $line -split '\s+', 2
    if ($parts.Count -eq 2 -and $parts[1].TrimStart('*') -eq $Asset) { $want = $parts[0].ToLower() }
  }
  if (-not $want) { throw "owlsh install: $Asset is not listed in SHA256SUMS" }
  $got = (Get-FileHash -Algorithm SHA256 (Join-Path $Tmp $Asset)).Hash.ToLower()
  if ($want -ne $got) { throw "owlsh install: checksum mismatch for $Asset (expected $want, got $got) - not installing" }
  Write-Host "Checksum verified."

  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $Dest = Join-Path $BinDir "owlsh.exe"
  Move-Item -Force (Join-Path $Tmp $Asset) $Dest
} finally {
  Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $UserPath) { $UserPath = "" }
if (-not (($UserPath -split ';') -contains $BinDir)) {
  [Environment]::SetEnvironmentVariable("Path", (($UserPath.TrimEnd(';') + ";$BinDir").TrimStart(';')), "User")
  $env:Path += ";$BinDir"
  Write-Host "Added $BinDir to your user PATH (new terminals pick it up)."
}

Write-Host ""
Write-Host "Installed: $Dest"
Write-Host ""
Write-Host "Capture a run (hack as normal, type 'exit' to finish):"
Write-Host "  owlsh --attach --platform htb --target <box>"
