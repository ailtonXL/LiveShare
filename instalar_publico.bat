@echo off
setlocal
chcp 65001 >nul 2>nul
title LiveForge Studio - Instalar acesso publico HTTPS
cd /d "%~dp0"
if not exist "server.js" (
 echo Extraia todo o ZIP antes de executar o instalador.
 pause
 exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0configurar_acesso_publico.ps1"
if errorlevel 1 (
 echo.
 echo Falha na instalacao. Veja os detalhes acima.
 pause
 exit /b 1
)
exit /b 0
