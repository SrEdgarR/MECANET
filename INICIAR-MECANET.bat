@echo off
cd /d "%~dp0"
call sistema\iniciar-servidor.bat
exit /b %errorlevel%
