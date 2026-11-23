@echo off
setlocal
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title LiveForge Studio - Acesso Publico
if not exist ".liveforge-publico.cmd" (
 echo.
 echo Configuracao publica nao encontrada.
 echo Execute instalar_publico.bat primeiro.
 pause
 exit /b 1
)
call "%~dp0.liveforge-publico.cmd"
if not exist "Caddyfile.publico" (
 echo Caddyfile.publico nao encontrado. Reexecute instalar_publico.bat.
 pause
 exit /b 1
)
if not exist "%LIVEFORGE_NODE%" (
 echo Node.js nao encontrado. Reexecute instalar_publico.bat.
 pause
 exit /b 1
)
if not exist "%LIVEFORGE_CADDY%" (
 echo Caddy nao encontrado. Reexecute instalar_publico.bat.
 pause
 exit /b 1
)
echo.
echo LIVEFORGE STUDIO - PUBLICO
echo Estudio: http://localhost:3000
echo Link publico: https://%LIVEFORGE_PUBLIC_IP%
echo.
echo ABRINDO DUAS JANELAS: Node.js e Caddy HTTPS.
echo.
rem Evita continuar com um servidor antigo em 3000, que nao geraria o link publico.
powershell.exe -NoProfile -NonInteractive -Command "if (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }" >nul 2>nul
if errorlevel 1 (
 echo [ATENCAO] A porta 3000 ja esta ocupada.
 echo Feche outras janelas LiveForge/Node e execute novamente.
 pause
 exit /b 1
)
echo Mantenha as duas abertas durante a live.
echo.
start "LiveForge - Servidor" /D "%~dp0" "%~dp0servidor_publico.bat"
timeout /t 2 /nobreak >nul
start "LiveForge - HTTPS" /D "%~dp0" "%~dp0https_publico.bat"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
echo.
echo Se a URL publica nao abrir no 4G/5G, confira NAT, firewall,
echo o IP WAN e os logs da janela do Caddy.
echo O site local nao prova que o certificado publico ja foi emitido.
echo.
pause
