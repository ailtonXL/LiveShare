@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>nul
title LiveForge Studio - Instalar
cd /d "%~dp0"
echo.
echo ========================================================
echo               LIVEFORGE STUDIO - INSTALAR
 echo ========================================================
echo.
echo Selecione como deseja publicar sua live:
echo.
echo [1] HTTPS no IP publico  - portas TCP 80 e 443 (recomendado)
echo [2] Somente TCP 3000   - HTTP sem certificado (modo simples)
echo [3] Apenas neste PC   - localhost, sem porta no roteador
echo.
choice /C 123 /N /M "Escolha 1, 2 ou 3: "
if errorlevel 3 (
  call "%~dp0instalar_local.bat"
) else if errorlevel 2 (
  call "%~dp0instalar_porta_3000.bat"
) else (
  call "%~dp0instalar_publico.bat"
)
exit /b %errorlevel%
