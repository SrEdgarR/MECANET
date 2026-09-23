# ============================================
# MECANET - Script de Configuración Inicial
# ============================================
# Este script ayuda a configurar MECANET para un nuevo cliente

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "   MECANET - Configuracion Inicial" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

# Verificar si ya fue configurado
$configFlag = ".mecanet-configured"
if (Test-Path $configFlag) {
    Write-Host "MECANET ya esta configurado." -ForegroundColor Yellow
    Write-Host "Si necesitas reconfigurar, elimina el archivo: $configFlag" -ForegroundColor Gray
    Write-Host "`nPresiona Enter para continuar..." -ForegroundColor Gray
    Read-Host
    exit 0
}

# Verificar si ya existe .env
if (Test-Path ".env") {
    Write-Host "ADVERTENCIA: Ya existe un archivo .env" -ForegroundColor Yellow
    $response = Read-Host "Deseas sobrescribirlo? (s/n)"
    if ($response -ne 's' -and $response -ne 'S') {
        Write-Host "Operacion cancelada" -ForegroundColor Gray
        exit 0
    }
}

# Verificar que existe .env.example
if (-not (Test-Path ".env.example")) {
    Write-Host "ADVERTENCIA: No se encuentra el archivo .env.example" -ForegroundColor Yellow
    Write-Host "Creando archivo .env.example por defecto..." -ForegroundColor Cyan
    
    $defaultEnv = @"
# ============================================
# MECANET - Configuración del Sistema
# ============================================
# IMPORTANTE: Renombra este archivo a ".env" y completa los valores

# Conexión a MongoDB
# Obtén tu URL de conexión desde MongoDB Atlas (https://www.mongodb.com/cloud/atlas)
# O usa una instancia local: mongodb://localhost:27017/mecanet
MONGODB_URI=mongodb://localhost:27017/mecanet

# Secreto para JWT (Tokens de autenticación)
# Genera uno único ejecutando: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# O usa el script: node scripts/generateJwtSecret.js
JWT_SECRET=CAMBIA_ESTE_VALOR_POR_UNO_SEGURO_DE_64_CARACTERES_MINIMO
JWT_EXPIRE=1h

# Puerto del servidor
PORT=5000

# Entorno de ejecución
NODE_ENV=production
"@
    $defaultEnv | Out-File -FilePath ".env.example" -Encoding UTF8
    
    if (-not (Test-Path ".env.example")) {
        Write-Host "ERROR: No se pudo crear el archivo .env.example" -ForegroundColor Red
        exit 1
    }
    Write-Host "Archivo .env.example creado exitosamente." -ForegroundColor Green
}

Write-Host "Configurando MECANET para nuevo cliente...`n" -ForegroundColor White

# Generar JWT Secret
Write-Host "[1/4] Generando JWT Secret seguro..." -ForegroundColor Cyan
$jwtSecret = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })

# Solicitar información de MongoDB
Write-Host "[2/4] Configuracion de Base de Datos" -ForegroundColor Cyan
Write-Host "Opciones:" -ForegroundColor White
Write-Host "  1. MongoDB Atlas (en la nube - recomendado)" -ForegroundColor Gray
Write-Host "  2. MongoDB Local (en esta computadora)" -ForegroundColor Gray
$dbOption = Read-Host "Selecciona una opcion (1/2)"

if ($dbOption -eq "1") {
    Write-Host "`nPara obtener tu URL de MongoDB Atlas:" -ForegroundColor Yellow
    Write-Host "  1. Ve a https://www.mongodb.com/cloud/atlas" -ForegroundColor Gray
    Write-Host "  2. Crea una cuenta gratuita" -ForegroundColor Gray
    Write-Host "  3. Crea un cluster" -ForegroundColor Gray
    Write-Host "  4. Conecta -> Drivers -> Copia la cadena de conexion`n" -ForegroundColor Gray
    
    $mongoUri = Read-Host "Pega tu URL de MongoDB Atlas"
    
    # Validar formato básico
    if ($mongoUri -notmatch "^mongodb(\+srv)?://") {
        Write-Host "ADVERTENCIA: La URL no parece valida. Asegurate de que comience con mongodb:// o mongodb+srv://" -ForegroundColor Yellow
    }
} else {
    $mongoUri = "mongodb://localhost:27017/mecanet"
    Write-Host "Usando MongoDB local: $mongoUri" -ForegroundColor Green
}

# Solicitar puerto
Write-Host "`n[3/4] Configuracion del Puerto" -ForegroundColor Cyan
$port = Read-Host "Puerto del servidor (presiona Enter para usar 5000)"
if ([string]::IsNullOrWhiteSpace($port)) {
    $port = "5000"
}

# Crear archivo .env
Write-Host "`n[4/4] Creando archivo de configuracion..." -ForegroundColor Cyan

$envContent = @"
# ============================================
# MECANET - Configuración del Sistema
# ============================================
# Generado automáticamente el $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')

# Conexión a MongoDB
MONGODB_URI=$mongoUri

# Secreto para JWT (¡NUNCA COMPARTAS ESTE VALOR!)
JWT_SECRET=$jwtSecret
JWT_EXPIRE=1h

# Puerto del servidor
PORT=$port

# Entorno de ejecución
NODE_ENV=production
"@

$envContent | Out-File -FilePath ".env" -Encoding UTF8

Write-Host "`n[OK] Archivo .env creado!" -ForegroundColor Green

# ============================================
# VERIFICAR CONEXION Y CREAR USUARIO
# ============================================
Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "   VERIFICANDO CONEXION A MONGODB" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

# Detectar Node.js
$nodePath = "node"
$npmPath = "npm"
$isPortable = $false

if (Test-Path "node\node.exe") {
    $nodePath = "node\node.exe"
    $npmPath = "node\node_modules\npm\bin\npm-cli.js"
    $isPortable = $true
} else {
    try {
        $null = & node --version 2>&1
    } catch {
        Write-Host "ERROR: Node.js no instalado" -ForegroundColor Red
        Read-Host "`nPresiona Enter"
        exit 1
    }
}

& $nodePath "scripts\check-node-version.cjs"
if ($LASTEXITCODE -ne 0) { exit 1 }

# Instalar dependencias si es necesario
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias necesarias..." -ForegroundColor Yellow
    Write-Host "Esto puede tomar unos minutos, por favor espera..." -ForegroundColor Gray
    
    try {
        if ($isPortable) {
            & $nodePath $npmPath install --omit=dev
        } else {
            & npm install --omit=dev
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Dependencias instaladas correctamente" -ForegroundColor Green
        } else {
            Write-Host "[ERROR] Falló la instalación de dependencias" -ForegroundColor Red
            Write-Host "Intenta ejecutar 'npm install' manualmente" -ForegroundColor Yellow
            Read-Host "Presiona Enter para salir"
            exit 1
        }
    } catch {
        Write-Host "[ERROR] Ocurrió un error instalando dependencias: $_" -ForegroundColor Red
        exit 1
    }
}

# Verificar conexión usando script dedicado
Write-Host "Verificando conexión a MongoDB..." -ForegroundColor Yellow

try {
    $testOutput = & $nodePath "scripts\test-db-connection.js" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Conexion a MongoDB exitosa!" -ForegroundColor Green
        $connectionOk = $true
    } else {
        Write-Host "[ERROR] No se pudo conectar a MongoDB" -ForegroundColor Red
        Write-Host "Detalles del error:" -ForegroundColor Gray
        $testOutput | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        Write-Host "`nVerifica:" -ForegroundColor Yellow
        Write-Host "  1. Tu usuario y contraseña en la URL" -ForegroundColor Gray
        Write-Host "  2. Que tu IP actual esté permitida en MongoDB Atlas (Network Access)" -ForegroundColor Gray
        $connectionOk = $false
    }
} catch {
    Write-Host "[ERROR] Falló la ejecución del script de prueba" -ForegroundColor Red
    Write-Host $_ -ForegroundColor Red
    $connectionOk = $false
}

# Crear usuario si hay conexión
if ($connectionOk) {
    Write-Host "`n============================================" -ForegroundColor Cyan
    Write-Host "   CREAR USUARIO ADMINISTRADOR" -ForegroundColor Cyan
    Write-Host "============================================`n" -ForegroundColor Cyan
    
    $createUser = Read-Host "Crear usuario administrador ahora? (s/n)"
    
    if ($createUser -eq 's' -or $createUser -eq 'S') {
        Write-Host "`nCreando usuario administrador..." -ForegroundColor Cyan
        Write-Host "Usando script createAdmin.js" -ForegroundColor Gray
        
        try {
            # Detener servidor temporal primero
            Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            
            # Ejecutar script de creación de admin
            & $nodePath "scripts\createAdmin.js" 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "[OK] Usuario administrador creado!" -ForegroundColor Green
                
                # Preguntar si desea crear usuario desarrollador
                Write-Host "`n" -NoNewline
                $createDev = Read-Host "Crear usuario desarrollador tambien? (s/n)"
                
                if ($createDev -eq 's' -or $createDev -eq 'S') {
                    Write-Host "`nCreando usuario desarrollador..." -ForegroundColor Cyan
                    & $nodePath "scripts\createDeveloper.js"
                    
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "[OK] Usuario desarrollador creado!" -ForegroundColor Green
                    } else {
                        Write-Host "[ADVERTENCIA] No se pudo crear usuario desarrollador" -ForegroundColor Yellow
                    }
                }
                
                Write-Host "`n⚠️  IMPORTANTE: Cambia las contraseñas tras el primer login" -ForegroundColor Yellow
            } else {
                Write-Host "[ERROR] No se pudo crear el usuario" -ForegroundColor Red
                Write-Host "Podras crearlo desde la interfaz web" -ForegroundColor Yellow
            }
            
        } catch {
            Write-Host "[ERROR] Error ejecutando createAdmin.js" -ForegroundColor Red
            Write-Host "Podras crear usuarios desde la interfaz web" -ForegroundColor Yellow
        }
    }
}

# Crear marca de configuración
"Configurado el $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')" | Out-File -FilePath $configFlag -Encoding UTF8

Write-Host "`n============================================" -ForegroundColor Green
Write-Host "   CONFIGURACION COMPLETADA" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "`nProximos pasos:" -ForegroundColor Cyan
Write-Host "  1. Ejecuta INICIAR-MECANET.bat" -ForegroundColor White
Write-Host "  2. Abre http://localhost:$port" -ForegroundColor White
Write-Host "  3. Inicia sesion y comienza a usar MECANET!" -ForegroundColor White
Write-Host "============================================`n" -ForegroundColor Cyan

Read-Host "Presiona Enter para continuar"
