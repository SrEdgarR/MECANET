@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\stop-local-server.ps1"
exit /b %errorlevel%
