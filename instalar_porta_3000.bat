@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>nul
title LiveForge Studio - Instalar somente porta 3000
cd /d "%~dp0"
if not exist "server.js" (
  echo [ERRO] Extraia todos os arquivos do ZIP antes de instalar.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0configurar_porta_3000.ps1"
if errorlevel 1 (
  echo.
  echo [ERRO] Instalacao nao concluida. Consulte a mensagem acima.
  pause
  exit /b 1
)
exit /b 0
