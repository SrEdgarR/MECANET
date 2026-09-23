# Script para probar el ejecutable localmente antes de distribuir
# Simula el entorno de producción

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "   PRUEBA DE EJECUTABLE MECANET" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

# Verificar que existe el ejecutable
if (-not (Test-Path "dist\mecanet-backend.exe")) {
    Write-Host "ERROR: No se encuentra el ejecutable en dist\mecanet-backend.exe" -ForegroundColor Red
    Write-Host "Ejecuta primero: npm run build:exe`n" -ForegroundColor Yellow
    exit 1
}

# Verificar que existe el .env
if (-not (Test-Path ".env")) {
    Write-Host "ADVERTENCIA: No se encuentra el archivo .env" -ForegroundColor Yellow
    Write-Host "El ejecutable intentara arrancar sin configuracion`n" -ForegroundColor Yellow
}

Write-Host "Ejecutable encontrado: dist\mecanet-backend.exe" -ForegroundColor Green
Write-Host "Tamano: $((Get-Item 'dist\mecanet-backend.exe').Length / 1MB) MB`n" -ForegroundColor Gray

Write-Host "Copiando archivos a carpeta de prueba..." -ForegroundColor Cyan

# Crear carpeta temporal de prueba
$testFolder = "MECANET-TEST"
if (Test-Path $testFolder) {
    Remove-Item -Path $testFolder -Recurse -Force
}
New-Item -ItemType Directory -Path $testFolder -Force | Out-Null

# Copiar ejecutable
Copy-Item "dist\mecanet-backend.exe" -Destination $testFolder

# Copiar .env si existe
if (Test-Path ".env") {
    Copy-Item ".env" -Destination $testFolder
    Write-Host "Archivo .env copiado" -ForegroundColor Green
}

Write-Host "`nArchivos listos en: $testFolder\" -ForegroundColor Green
Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "   INICIANDO EJECUTABLE..." -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

Write-Host "IMPORTANTE: Observa los mensajes de error si el programa se cierra" -ForegroundColor Yellow
Write-Host "La ventana permanecera abierta si hay errores`n" -ForegroundColor Yellow

# Cambiar a la carpeta de prueba y ejecutar
Set-Location $testFolder
Start-Process -FilePath ".\mecanet-backend.exe" -NoNewWindow -Wait

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "   FIN DE LA PRUEBA" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan
