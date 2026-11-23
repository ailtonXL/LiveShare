@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale Node.js 20+ em https://nodejs.org
  pause
  exit /b 1
)
echo.
echo ===========================
echo   LIVEFORGE STUDIO
 echo ===========================
echo Site: http://localhost:3000
echo.
start "" "http://localhost:3000"
node server.js
pause
