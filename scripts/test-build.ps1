# ============================================
# MECANET - Script de Prueba de Compilación
# ============================================
# Este script verifica que el frontend se compile correctamente
# sin generar el ejecutable completo (más rápido)
# ============================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   MECANET - Prueba de Compilacion" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Función para mostrar errores y salir
function Show-Error {
    param([string]$Message)
    Write-Host "❌ ERROR: $Message" -ForegroundColor Red
    exit 1
}

# Función para mostrar éxito
function Show-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

# Función para mostrar información
function Show-Info {
    param([string]$Message)
    Write-Host "ℹ $Message" -ForegroundColor Cyan
}

# Verificar que estamos en la raíz del proyecto
if (-not (Test-Path "package.json")) {
    Show-Error "Este script debe ejecutarse desde la raíz del proyecto MECANET"
}

# ============================================
# 1. VERIFICAR NODE Y NPM
# ============================================
Show-Info "Verificando Node.js y npm..."

try {
    $nodeVersion = node --version
    $npmVersion = npm --version
    Show-Success "Node.js: $nodeVersion"
    Show-Success "npm: $npmVersion"
} catch {
    Show-Error "Node.js o npm no están instalados. Instale Node.js desde https://nodejs.org/"
}

# ============================================
# 2. VERIFICAR DEPENDENCIAS DEL BACKEND
# ============================================
Write-Host ""
Show-Info "Verificando dependencias del backend..."

if (-not (Test-Path "node_modules")) {
    Show-Info "Instalando dependencias del backend..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Show-Error "Fallo la instalación de dependencias del backend"
    }
    Show-Success "Dependencias del backend instaladas"
} else {
    Show-Success "Dependencias del backend ya instaladas"
}

# ============================================
# 3. VERIFICAR DEPENDENCIAS DEL FRONTEND
# ============================================
Write-Host ""
Show-Info "Verificando dependencias del frontend..."

Set-Location client

if (-not (Test-Path "node_modules")) {
    Show-Info "Instalando dependencias del frontend..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Set-Location ..
        Show-Error "Fallo la instalación de dependencias del frontend"
    }
    Show-Success "Dependencias del frontend instaladas"
} else {
    Show-Success "Dependencias del frontend ya instaladas"
}

# ============================================
# 4. COMPILAR EL FRONTEND
# ============================================
Write-Host ""
Show-Info "Compilando el frontend..."

# Limpiar carpeta dist anterior si existe
if (Test-Path "dist") {
    Remove-Item -Path "dist" -Recurse -Force
    Show-Info "Carpeta dist anterior eliminada"
}

npm run build

if ($LASTEXITCODE -ne 0) {
    Set-Location ..
    Show-Error "Fallo la compilación del frontend"
}

# Verificar que se generó la carpeta dist
if (-not (Test-Path "dist")) {
    Set-Location ..
    Show-Error "No se generó la carpeta dist/"
}

# Verificar que existe index.html
if (-not (Test-Path "dist/index.html")) {
    Set-Location ..
    Show-Error "No se generó el archivo dist/index.html"
}

Show-Success "Frontend compilado correctamente"

# Contar archivos generados
$fileCount = (Get-ChildItem -Path "dist" -Recurse -File).Count
Show-Info "Archivos generados: $fileCount"

Set-Location ..

# ============================================
# 5. VERIFICAR CONFIGURACIÓN DE PKG
# ============================================
Write-Host ""
Show-Info "Verificando configuracion de pkg..."

# Leer package.json
$packageJson = Get-Content "package.json" | ConvertFrom-Json

# Verificar que exista la sección pkg
if (-not $packageJson.pkg) {
    Show-Error "Falta la sección 'pkg' en package.json"
}

# Verificar bin
if (-not $packageJson.bin) {
    Show-Error "Falta la propiedad 'bin' en package.json"
} else {
    Show-Success "Configuración 'bin': $($packageJson.bin)"
}

# Verificar targets
if (-not $packageJson.pkg.targets) {
    Show-Error "Falta 'pkg.targets' en package.json"
} else {
    Show-Success "Target configurado: $($packageJson.pkg.targets)"
}

# Verificar assets
if (-not $packageJson.pkg.assets) {
    Show-Error "Falta 'pkg.assets' en package.json"
} else {
    Show-Success "Assets configurados: $($packageJson.pkg.assets.Count) entradas"
}

# ============================================
# 6. VERIFICAR SERVER.JS
# ============================================
Write-Host ""
Show-Info "Verificando server.js..."

$serverContent = Get-Content "server.js" -Raw

# Verificar import de 'open'
if ($serverContent -match "import open from 'open'") {
    Show-Success "Import de 'open' encontrado"
} else {
    Show-Error "Falta el import de 'open' en server.js"
}

# Verificar express.static
if ($serverContent -match "express\.static") {
    Show-Success "Configuración de archivos estáticos encontrada"
} else {
    Show-Error "Falta la configuración de express.static en server.js"
}

# Verificar NODE_ENV === 'production'
if ($serverContent -match "NODE_ENV === 'production'") {
    Show-Success "Verificación de NODE_ENV encontrada"
} else {
    Show-Error "Falta la verificación de NODE_ENV en server.js"
}

# Verificar llamada a open()
if ($serverContent -match "open\(") {
    Show-Success "Llamada a open() encontrada"
} else {
    Show-Error "Falta la llamada a open() en server.js"
}

# ============================================
# RESUMEN FINAL
# ============================================
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "   TODAS LAS VERIFICACIONES PASARON" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

Show-Info "El sistema esta listo para generar el ejecutable."
Write-Host ""

Write-Host "Siguientes pasos:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Generar el ejecutable completo:" -ForegroundColor White
Write-Host "   npm run build:exe" -ForegroundColor Gray
Write-Host ""

Write-Host "2. O usar el script de distribucion:" -ForegroundColor White
Write-Host "   .\scripts\build-distribution.ps1 -ClientName 'NombreCliente'" -ForegroundColor Gray
Write-Host ""

Write-Host "3. El ejecutable se generara en:" -ForegroundColor White
Write-Host "   dist\mecanet-backend.exe" -ForegroundColor Gray
Write-Host ""

Show-Success "Sistema verificado y listo!"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
