. (Join-Path $PSScriptRoot 'distribution-common.ps1')
$null = Assert-DistributionPath (Join-Path $distributionRoot 'MECANET-Portable')
& node (Join-Path $PSScriptRoot 'package-portable.js')
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el paquete publico.' }
