@echo off
setlocal
chcp 65001 >nul 2>nul
cd /d "%~dp0"
call "%~dp0.liveforge-publico.cmd"
set "HOST=127.0.0.1"
set "PORT=3000"
set "LOCAL_ONLY_STUDIO=1"
set "PUBLIC_BASE_URL=https://%LIVEFORGE_PUBLIC_IP%"
echo LiveForge Node: http://localhost:3000
echo Acesso publico apenas pelo Caddy: https://%LIVEFORGE_PUBLIC_IP%
echo.
"%LIVEFORGE_NODE%" "%~dp0server.js"
echo.
echo O servidor encerrou ou houve um erro.
pause
