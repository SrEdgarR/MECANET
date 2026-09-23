$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$distributionRoot = Join-Path $projectRoot 'distribucion'

function Assert-NoReparsePoints([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Enlace no permitido: $Path" }
    if ($item.PSIsContainer) {
        foreach ($child in Get-ChildItem -LiteralPath $Path -Force) { Assert-NoReparsePoints $child.FullName }
    }
}
function Assert-DistributionPath([string]$Path) {
    $resolved = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($resolved -ne $distributionRoot -and -not $resolved.StartsWith($distributionRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'La operacion debe permanecer dentro de distribucion.'
    }
    $parent = $resolved
    while ($parent) {
        if (Test-Path -LiteralPath $parent) {
            if ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'No se permiten enlaces en la ruta de distribucion.' }
        }
        $parent = [IO.Path]::GetDirectoryName($parent)
    }
    Assert-NoReparsePoints $resolved
    return $resolved
}
