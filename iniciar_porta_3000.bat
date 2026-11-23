@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title LiveForge Studio - TCP 3000 publico
if not exist ".liveforge-porta3000.cmd" (
  echo [ERRO] Configuracao nao encontrada. Execute instalar.bat e escolha [2].
  pause
  exit /b 1
)
call "%~dp0.liveforge-porta3000.cmd"
if not exist "%LIVEFORGE_NODE%" (
  echo [ERRO] Node.js nao localizado. Reexecute o instalador.
  pause
  exit /b 1
)
set "HOST=0.0.0.0"
set "PORT=3000"
set "LOCAL_ONLY_STUDIO=1"
set "PUBLIC_BASE_URL=http://%LIVEFORGE_PUBLIC_IP%:3000"
echo.
echo =========================================================
echo  LIVEFORGE - MODO SOMENTE PORTA TCP 3000
 echo =========================================================
echo  TRANSMISSOR (ABRA SOMENTE NO SEU PC): http://localhost:3000
 echo  AMIGO: http://%LIVEFORGE_PUBLIC_IP%:3000/?watch=CODIGO
 echo.
echo  [AVISO] Este modo usa HTTP sem TLS no acesso publico.
echo  Nao abra o estudio pelo IP publico: compartilhe no localhost.
echo  Mantenha esta janela aberta durante a live.
echo.
rem Evita iniciar duplicado e usar outro servidor sem o link externo.
powershell.exe -NoProfile -NonInteractive -Command "if (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }" >nul 2>nul
if errorlevel 1 (
  echo [ERRO] A porta 3000 ja esta ocupada. Feche outros servidores LiveForge.
  pause
  exit /b 1
)
start "" "http://localhost:3000"
"%LIVEFORGE_NODE%" "%~dp0server.js"
echo.
echo Servidor encerrado.
pause
