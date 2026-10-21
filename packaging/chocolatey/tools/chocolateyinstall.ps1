$ErrorActionPreference = 'Stop'

# Downloads the official NameDaemon installer (NSIS) from namedaemon.com and verifies its SHA-256 before running it silently.
$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = 'https://namedaemon.com/wp-content/uploads/nd-downloads/NameDaemon_0.2.0_x64-setup.exe'
  checksum64     = 'e9ac27c8ec6b5d79c5acc919aa94f3af6576613e20c3491470026d74bc969e9c'
  checksumType64 = 'sha256'
  silentArgs     = '/S'
  validExitCodes = @(0)
  softwareName   = 'NameDaemon*'
}

Install-ChocolateyPackage @packageArgs
