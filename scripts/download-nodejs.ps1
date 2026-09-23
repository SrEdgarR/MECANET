. (Join-Path $PSScriptRoot 'distribution-common.ps1')
$nodeVersion = 'v24.21.0'
# Official https://nodejs.org/dist/v24.21.0/SHASUMS256.txt
$expectedHash = '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541'
$destination = Assert-DistributionPath (Join-Path $distributionRoot 'MECANET-Portable\node')
if (Test-Path -LiteralPath $destination) { throw 'Ya existe el entorno portable. Archive la carpeta antes de reemplazarlo.' }
$stage = Assert-DistributionPath (Join-Path $distributionRoot ('node-download-' + [Guid]::NewGuid().ToString('N')))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    $zip = Join-Path $stage 'node.zip'
    Invoke-WebRequest -Uri "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip" -OutFile $zip -UseBasicParsing
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'La descarga no coincide con el SHA-256 oficial.' }
    Expand-Archive -LiteralPath $zip -DestinationPath $stage
    $extracted = Assert-DistributionPath (Join-Path $stage "node-$nodeVersion-win-x64")
    $parent = Assert-DistributionPath (Split-Path -Parent $destination)
    if (-not (Test-Path -LiteralPath $parent)) { throw 'Cree primero el paquete portable.' }
    Move-Item -LiteralPath $extracted -Destination $destination
    Write-Host "Node.js $nodeVersion verificado e incluido."
} finally {
    $stage = Assert-DistributionPath $stage
    Remove-Item -LiteralPath $stage -Recurse -Force
}
