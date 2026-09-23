$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$entry = [regex]::Escape((Join-Path $projectRoot 'server.js'))
$pattern = '(^|\s)"?' + $entry + '"?(\s|$)'
$instances = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -match $pattern })
foreach ($instance in $instances) { Stop-Process -Id $instance.ProcessId -ErrorAction Stop }
if ($instances.Count) { Write-Host '[OK] Instancia local de MECANET detenida.' }
else { Write-Host '[INFO] No se encontro una instancia iniciada desde esta carpeta.' }
