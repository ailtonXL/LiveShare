@echo off
setlocal
chcp 65001 >nul 2>nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0remover_regra_3000.ps1"
exit /b %errorlevel%
