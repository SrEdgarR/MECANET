# ============================================
# MECANET - Verificar Paquete para Distribución
# ============================================
# Este script verifica que el paquete no contenga datos sensibles

param(
    [string]$PackagePath = "distribucion\MECANET-Portable"
)

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "   VERIFICACION DE PAQUETE" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

if (-not (Test-Path $PackagePath)) {
    Write-Host "ERROR: No se encuentra el paquete en: $PackagePath" -ForegroundColor Red
    exit 1
}

Write-Host "Verificando paquete: $PackagePath`n" -ForegroundColor White

$errors = @()
$warnings = @()

# Verificación 1: No debe existir .env con datos reales
Write-Host "[1/8] Verificando archivo .env..." -ForegroundColor Cyan
if (Test-Path "$PackagePath\.env") {
    $errors += "Archivo .env encontrado (contiene datos sensibles)"
    Write-Host "  [X] FALLO: .env existe" -ForegroundColor Red
} else {
    Write-Host "  [OK] No existe .env" -ForegroundColor Green
}

# Verificación 2: Debe existir .env.example
Write-Host "[2/8] Verificando .env.example..." -ForegroundColor Cyan
if (Test-Path "$PackagePath\.env.example") {
    Write-Host "  [OK] .env.example existe" -ForegroundColor Green
} else {
    $errors += ".env.example no encontrado"
    Write-Host "  [X] FALLO: .env.example no existe" -ForegroundColor Red
}

# Verificación 3: No debe haber logs
Write-Host "[3/8] Verificando logs..." -ForegroundColor Cyan
if (Test-Path "$PackagePath\logs") {
    $warnings += "Carpeta logs encontrada"
    Write-Host "  [!] ADVERTENCIA: Carpeta logs existe" -ForegroundColor Yellow
} else {
    Write-Host "  [OK] No hay carpeta logs" -ForegroundColor Green
}

# Verificación 4: Archivos de configuración
Write-Host "[4/8] Verificando archivos de usuario..." -ForegroundColor Cyan
$userFiles = @(
    "CONFIGURAR-INICIAL.bat",
    "INICIAR-MECANET.bat",
    "DETENER-MECANET.bat",
    "LEEME-PRIMERO.txt"
)
foreach ($file in $userFiles) {
    if (Test-Path "$PackagePath\$file") {
        Write-Host "  [OK] $file" -ForegroundColor Green
    } else {
        $errors += "$file no encontrado en raiz"
        Write-Host "  [X] FALLO: $file no existe" -ForegroundColor Red
    }
}

# Verificar carpeta sistema
if (Test-Path "$PackagePath\sistema") {
    Write-Host "  [OK] Carpeta sistema/ existe" -ForegroundColor Green
    $sysFiles = @(
        "sistema\iniciar-servidor.bat",
        "sistema\detener-servidor.bat",
        "sistema\CONFIGURAR-INICIAL.ps1"
    )
    foreach ($file in $sysFiles) {
        if (Test-Path "$PackagePath\$file") {
            Write-Host "  [OK] $file" -ForegroundColor Green
        } else {
            $warnings += "$file no encontrado"
            Write-Host "  [!] ADVERTENCIA: $file no existe" -ForegroundColor Yellow
        }
    }
} else {
    $errors += "Carpeta sistema/ no encontrada"
    Write-Host "  [X] FALLO: Carpeta sistema/ no existe" -ForegroundColor Red
}

# Verificación 5: Backend
Write-Host "[5/8] Verificando estructura del backend..." -ForegroundColor Cyan
$backendFolders = @('config', 'controllers', 'models', 'routes')
foreach ($folder in $backendFolders) {
    if (Test-Path "$PackagePath\$folder") {
        Write-Host "  [OK] $folder/" -ForegroundColor Green
    } else {
        $errors += "Carpeta $folder no encontrada"
        Write-Host "  [X] FALLO: $folder/ no existe" -ForegroundColor Red
    }
}

# Verificación 6: Node.js portable
Write-Host "[6/8] Verificando Node.js portable..." -ForegroundColor Cyan
if (Test-Path "$PackagePath\node\node.exe") {
    Write-Host "  [OK] Node.js portable incluido" -ForegroundColor Green
} else {
    $warnings += "Node.js portable no encontrado (el cliente deberá instalarlo)"
    Write-Host "  [!] ADVERTENCIA: Node.js no incluido" -ForegroundColor Yellow
}

# Verificación 7: Frontend compilado
Write-Host "[7/8] Verificando frontend..." -ForegroundColor Cyan
if (Test-Path "$PackagePath\client\dist") {
    Write-Host "  [OK] Frontend compilado incluido" -ForegroundColor Green
} else {
    $errors += "Frontend no compilado"
    Write-Host "  [X] FALLO: client\dist no existe" -ForegroundColor Red
}

# Verificación 8: Archivos de logs temporales
Write-Host "[8/8] Verificando archivos temporales..." -ForegroundColor Cyan
$tempFiles = Get-ChildItem "$PackagePath" -Recurse -Include *.log,*.tmp -ErrorAction SilentlyContinue
if ($tempFiles.Count -gt 0) {
    $warnings += "Archivos temporales encontrados: $($tempFiles.Count)"
    Write-Host "  [!] ADVERTENCIA: $($tempFiles.Count) archivos temporales" -ForegroundColor Yellow
} else {
    Write-Host "  [OK] No hay archivos temporales" -ForegroundColor Green
}

# Resumen
Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "   RESUMEN" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

if ($errors.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host "[OK] PAQUETE LISTO PARA DISTRIBUCION" -ForegroundColor Green
    Write-Host "No se encontraron errores ni advertencias`n" -ForegroundColor Green
    exit 0
}

if ($errors.Count -gt 0) {
    Write-Host "ERRORES CRITICOS ($($errors.Count)):" -ForegroundColor Red
    foreach ($error in $errors) {
        Write-Host "  - $error" -ForegroundColor Red
    }
    Write-Host ""
}

if ($warnings.Count -gt 0) {
    Write-Host "ADVERTENCIAS ($($warnings.Count)):" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "  - $warning" -ForegroundColor Yellow
    }
    Write-Host ""
}

if ($errors.Count -gt 0) {
    Write-Host "[X] PAQUETE NO LISTO - Corrige los errores antes de distribuir" -ForegroundColor Red
    exit 1
} else {
    Write-Host "[!] PAQUETE LISTO CON ADVERTENCIAS - Revisa antes de distribuir" -ForegroundColor Yellow
    exit 0
}
