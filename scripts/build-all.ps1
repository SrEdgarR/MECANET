param([switch]$SkipNodeJS, [switch]$Clean)
. (Join-Path $PSScriptRoot 'distribution-common.ps1')
if ($Clean) { & (Join-Path $PSScriptRoot 'clean-dist.ps1') }
& (Join-Path $PSScriptRoot 'create-portable.ps1')
if (-not $SkipNodeJS) { & (Join-Path $PSScriptRoot 'download-nodejs.ps1') }
& (Join-Path $PSScriptRoot 'package-for-distribution.ps1')
Write-Host 'MECANET-Portable y su ZIP estan preparados en distribucion.'
