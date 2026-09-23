. (Join-Path $PSScriptRoot 'distribution-common.ps1')
$directory = Assert-DistributionPath $distributionRoot
if (Test-Path -LiteralPath $directory) {
    foreach ($item in Get-ChildItem -LiteralPath $directory -Force) {
        if ($item.Name -eq 'README.md') { continue }
        $target = Assert-DistributionPath $item.FullName
        Remove-Item -LiteralPath $target -Recurse -Force
    }
}
Write-Host 'Distribucion limpiada.'
