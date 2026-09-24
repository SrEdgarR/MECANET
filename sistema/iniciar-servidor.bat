@echo off
chcp 65001 >nul

REM Ir al directorio raiz del proyecto
cd /d "%~dp0\.."

title MECANET - Servidor

REM ========================================================
REM 1. VERIFICACIONES INICIALES
REM ========================================================

REM Detectar Node.js (portable o global)
set "NODE_CMD=node"
if exist "node\node.exe" (
    set "NODE_CMD=node\node.exe"
) else (
    where node >nul 2>&1
    if errorlevel 1 (
        cls
        echo.
        echo [ERROR] Node.js no esta instalado.
        echo.
        echo El sistema no puede iniciar porque falta el entorno de ejecucion.
        echo Por favor contacte a soporte tecnico.
        echo.
        pause
        exit /b 1
    )
)

"%NODE_CMD%" scripts\check-node-version.cjs
if errorlevel 1 (
    echo [ERROR] No se pudo ejecutar Node.js.
    pause
    exit /b 1
)

REM Verificar que existe el archivo .env
if not exist ".env" (
    cls
    echo.
    echo [ADVERTENCIA] El sistema no esta configurado.
    echo.
    echo Por favor ejecute el archivo "CONFIGURAR-INICIAL" primero.
    echo.
    pause
    exit /b 1
)

REM Establecer NODE_ENV en produccion
set "NODE_ENV=production"

REM Una instalacion sin usuarios debe crear primero la cuenta con mas permisos.
if not exist "scripts\createDeveloper.js" (
    echo [ERROR] No se encontro el creador del primer usuario.
    pause
    exit /b 1
)
"%NODE_CMD%" scripts\createDeveloper.js --if-empty
if errorlevel 1 (
    echo [ERROR] No se pudo preparar el primer usuario. MECANET no se iniciara.
    pause
    exit /b 1
)

if not exist "scripts\check-local-server.cjs" (
    echo [ERROR] No se encontro el verificador local de MECANET.
    pause
    exit /b 1
)

REM Verificar si MECANET responde en el puerto configurado
set "RUNNING_PORT="
for /f "delims=" %%P in ('%NODE_CMD% scripts\check-local-server.cjs 2^>nul') do set "RUNNING_PORT=%%P"
if defined RUNNING_PORT (
    echo.
    echo [INFO] MECANET ya esta disponible en el puerto %RUNNING_PORT%.
    echo.
    if not defined SKIP_BROWSER_OPEN start "" "http://localhost:%RUNNING_PORT%"
    exit /b 0
)

REM Comprobar archivos necesarios antes de iniciar
if not exist "server.js" (
    echo [ERROR] No se encontro server.js en la carpeta del proyecto.
    pause
    exit /b 1
)

for %%D in (axios adm-zip semver dotenv) do (
    if not exist "node_modules\%%D\package.json" (
        echo [ERROR] Falta la dependencia %%D de MECANET.
        echo         Instale las dependencias del proyecto y vuelva a intentarlo.
        pause
        exit /b 1
    )
)

if not exist "client\dist\index.html" (
    echo [ERROR] El cliente de MECANET no esta compilado.
    echo         Vuelva a generar el paquete de MECANET y vuelva a intentarlo.
    pause
    exit /b 1
)

if not exist "scripts\check-release-update.js" (
    echo [ERROR] No se encontro el comprobador de Releases.
    pause
    exit /b 1
)

REM Consultar el ultimo Release antes de iniciar el servidor.
"%NODE_CMD%" scripts\check-release-update.js INICIAR-MECANET.bat
if "%errorlevel%"=="2" exit /b 0

REM ========================================================
REM 2. INICIAR SERVIDOR
REM ========================================================
cls
echo.
echo ========================================================
echo    INICIANDO MECANET
echo ========================================================
echo.
echo [INFO] Cargando sistema...
echo.

REM Iniciar el servidor
"%NODE_CMD%" "%CD%\server.js"

REM Capturar el codigo de salida
set SERVER_EXIT=%errorlevel%

REM Si el servidor se detiene, mostrar mensaje
echo.
echo ========================================================
echo    SERVIDOR DETENIDO
echo ========================================================
echo.
if %SERVER_EXIT% neq 0 (
    echo [ERROR] El sistema se detuvo inesperadamente (Codigo: %SERVER_EXIT%)
    echo         Por favor revise los mensajes de error arriba.
)
echo.
echo Presiona cualquier tecla para cerrar...
pause >nul
exit /b %SERVER_EXIT%
