# Publica un Release con notas y ZIP mediante el mismo flujo de npm run release.
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('patch', 'minor', 'major')]
    [string]$Type
)

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $root
try {
    & node (Join-Path $PSScriptRoot 'automated-release.js') --type $Type
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
