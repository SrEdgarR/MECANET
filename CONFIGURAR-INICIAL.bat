@echo off
chcp 65001 >nul
cd /d "%~dp0"
title MECANET - Configuracion Inicial

cls
echo.
echo ========================================================
echo    MECANET - Configuracion Inicial
echo ========================================================
echo.

REM Comprobar requisitos minimos antes de instalar dependencias.
set "NODE_CMD=node"
if exist "node\node.exe" (
    set "NODE_CMD=node\node.exe"
) else (
    where node >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Node.js no esta instalado.
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
where powershell >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PowerShell no esta disponible.
    pause
    exit /b 1
)

REM Instalar dependencias si aun no estan disponibles.
set "NEED_INSTALL="
for %%D in (axios adm-zip semver dotenv) do if not exist "node_modules\%%D\package.json" set "NEED_INSTALL=1"
if defined NEED_INSTALL (
    echo Instalando dependencias del sistema...
    if exist "node\node_modules\npm\bin\npm-cli.js" (
        "%NODE_CMD%" "node\node_modules\npm\bin\npm-cli.js" install --omit=dev --no-audit --no-fund --quiet
    ) else (
        call npm install --omit=dev --no-audit --no-fund --quiet
    )
    if errorlevel 1 (
        echo [ERROR] No se pudieron instalar las dependencias.
        pause
        exit /b 1
    )
)

if not exist "scripts\check-release-update.js" (
    echo [ERROR] No se encontro el comprobador de Releases.
    pause
    exit /b 1
)

"%NODE_CMD%" scripts\check-release-update.js CONFIGURAR-INICIAL.bat
if "%errorlevel%"=="2" exit /b 0

echo.
echo Iniciando asistente de configuracion...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "sistema\CONFIGURAR-INICIAL.ps1"
if errorlevel 1 (
    echo [ERROR] La configuracion no se completo.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo    Configuracion Finalizada Exitosamente
echo ========================================================
echo.
echo Ya puede iniciar el sistema usando "INICIAR-MECANET".
echo.
pause
exit /b 0
