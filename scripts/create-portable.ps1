. (Join-Path $PSScriptRoot 'distribution-common.ps1')
$destination = Assert-DistributionPath (Join-Path $distributionRoot 'MECANET-Portable')
if (Test-Path -LiteralPath $destination) { throw 'MECANET-Portable ya existe. Archive la carpeta antes de generar un paquete nuevo.' }
Push-Location $projectRoot
try {
    & node (Join-Path $PSScriptRoot 'create-release-zip.js')
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el Release.' }
    $version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
    if ($version -notmatch '^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$') { throw 'Version invalida' }
    $zip = Assert-DistributionPath (Join-Path $distributionRoot "MECANET-v$version.zip")
    Expand-Archive -LiteralPath $zip -DestinationPath $destination
    Write-Host "Paquete creado: $destination. Ejecute CONFIGURAR-INICIAL.bat en el equipo de destino."
} finally { Pop-Location }
