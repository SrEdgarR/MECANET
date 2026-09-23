param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Stage,
    [Parameter(Mandatory = $true)][int]$WaitPid,
    [Parameter(Mandatory = $true)][ValidateSet('INICIAR-MECANET.bat', 'CONFIGURAR-INICIAL.bat')][string]$Launcher
)
$ErrorActionPreference = 'Stop'
$rootPath = [IO.Path]::GetFullPath($Root).TrimEnd('\')
$stagePath = [IO.Path]::GetFullPath($Stage).TrimEnd('\')
if ([IO.Path]::GetDirectoryName($stagePath) -ne $rootPath -or
    [IO.Path]::GetFileName($stagePath) -notmatch '^\.mecanet-update-[A-Za-z0-9]{6}$') {
    throw 'La carpeta temporal de actualizacion no es valida.'
}
function Assert-LocalPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($full -ne $rootPath -and -not $full.StartsWith($rootPath + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta fuera de MECANET.' }
    $current = $full
    while ($current) {
        if ((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'No se permiten enlaces en la actualizacion.' }
        $current = [IO.Path]::GetDirectoryName($current)
    }
    return $full
}
function Get-RegularFiles([string]$Directory) {
    $null = Assert-LocalPath $Directory
    foreach ($item in Get-ChildItem -LiteralPath $Directory -Force) {
        $null = Assert-LocalPath $item.FullName
        if ($item.PSIsContainer) { Get-RegularFiles $item.FullName } else { $item }
    }
}
$packagePath = Assert-LocalPath (Join-Path $stagePath 'package')
$rollbackPath = Assert-LocalPath (Join-Path $stagePath 'rollback')
$changed = [System.Collections.Generic.List[object]]::new()
$directoryBackups = [System.Collections.Generic.List[object]]::new()
function Is-ManagedDirectoryFile([string]$Relative) { return $Relative -match '^(node_modules\\|client\\dist\\)' }
try {
    if (-not (Test-Path -LiteralPath (Join-Path $packagePath 'package-lock.json'))) { throw 'Falta package-lock.json.' }
    $null = @(Get-RegularFiles $packagePath)
    Write-Host '[1/3] Preparando dependencias...'
    Push-Location $packagePath
    try {
        $portableNode = Join-Path $rootPath 'node\node.exe'
        $portableNpm = Join-Path $rootPath 'node\node_modules\npm\bin\npm-cli.js'
        if ((Test-Path -LiteralPath $portableNode) -and (Test-Path -LiteralPath $portableNpm)) {
            $null = Assert-LocalPath $portableNode
            $null = Assert-LocalPath $portableNpm
            & $portableNode $portableNpm ci --omit=dev --ignore-scripts --engine-strict --no-audit --no-fund
        } else {
            & (Get-Command npm.cmd -ErrorAction Stop).Source ci --omit=dev --ignore-scripts --engine-strict --no-audit --no-fund
        }
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron preparar las dependencias. Compruebe Node.js 22.12 o posterior.' }
    } finally { Pop-Location }

    Write-Host '[2/3] Esperando al proceso anterior...'
    if ($WaitPid -gt 0) {
        try { Wait-Process -Id $WaitPid -Timeout 30 -ErrorAction Stop }
        catch { if (Get-Process -Id $WaitPid -ErrorAction SilentlyContinue) { throw 'El proceso anterior sigue ejecutandose.' } }
    }
    $files = @(Get-RegularFiles $packagePath)
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($packagePath.Length + 1)
        if ($relative -match '(^|\\)\.env($|\.)(?!example$)' -or $relative -match '(^|\\)(\.git|\.railway|logs|backups)(\\|$)') { throw 'Archivo privado dentro del paquete.' }
        $destination = Assert-LocalPath (Join-Path $rootPath $relative)
        $backup = Assert-LocalPath (Join-Path $rollbackPath $relative)
        if ((Test-Path -LiteralPath $destination) -and -not (Is-ManagedDirectoryFile $relative)) {
            if ((Get-Item -LiteralPath $destination).PSIsContainer) { throw 'La actualizacion entra en conflicto con una carpeta.' }
            New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null
            Copy-Item -LiteralPath $destination -Destination $backup
        }
    }
    # Replace generated trees so removed modules/assets cannot survive an update.
    foreach ($relative in @('node_modules', 'client\dist')) {
        $destination = Assert-LocalPath (Join-Path $rootPath $relative)
        $backup = Assert-LocalPath (Join-Path $stagePath ('previous-directories\' + $relative))
        $existed = Test-Path -LiteralPath $destination
        if ($existed) {
            $null = @(Get-RegularFiles $destination)
            New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null
            Move-Item -LiteralPath $destination -Destination $backup
        }
        $directoryBackups.Add(@{ Destination = $destination; Backup = $backup; Existed = $existed })
    }
    Write-Host '[3/3] Aplicando archivos...'

    foreach ($file in $files) {
        $relative = $file.FullName.Substring($packagePath.Length + 1)
        $destination = Assert-LocalPath (Join-Path $rootPath $relative)
        $backup = Join-Path $rollbackPath $relative
        if (-not (Is-ManagedDirectoryFile $relative)) { $changed.Add(@{ Destination = $destination; Backup = $backup; Existed = (Test-Path -LiteralPath $backup) }) }
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
    }
    if ($Launcher -eq 'CONFIGURAR-INICIAL.bat') {
        # The installation wizard requires a visible interactive console.
        Start-Process -FilePath (Join-Path $rootPath $Launcher) -WorkingDirectory $rootPath -WindowStyle Normal
    } else {
        Start-Process -FilePath (Join-Path $rootPath $Launcher) -WorkingDirectory $rootPath -WindowStyle Hidden
    }
    # Keep the rollback copy until the owner verifies startup; it contains no .env.
    Write-Host "Actualizacion aplicada. Respaldo anterior disponible en: $rollbackPath"
} catch {
    foreach ($entry in $changed) {
        $destination = Assert-LocalPath $entry.Destination
        if ($entry.Existed) { Copy-Item -LiteralPath $entry.Backup -Destination $destination -Force }
        elseif (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
    }
    foreach ($entry in $directoryBackups) {
        $destination = Assert-LocalPath $entry.Destination
        if (Test-Path -LiteralPath $destination) {
            $null = @(Get-RegularFiles $destination)
            Remove-Item -LiteralPath $destination -Recurse -Force
        }
        if ($entry.Existed) { Move-Item -LiteralPath $entry.Backup -Destination $destination }
    }
    Write-Error ('Actualizacion cancelada; se restauraron los archivos anteriores. ' + $_.Exception.Message)
    exit 1
}
