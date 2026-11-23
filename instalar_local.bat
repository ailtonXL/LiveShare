@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>nul
title LiveForge Studio - Instalador para Windows
cd /d "%~dp0"

echo.
echo =================================================
echo            LIVEFORGE STUDIO - INSTALADOR
echo =================================================
echo.

if not exist "server.js" goto arquivos_faltando
if not exist "public\index.html" goto arquivos_faltando

call :verificar_node
if not errorlevel 1 goto node_pronto

echo [1/3] Node.js 20 ou superior nao encontrado.
echo Tentando instalar Node.js LTS pelo gerenciador do Windows...
echo.
where winget.exe >nul 2>nul
if errorlevel 1 goto instalacao_manual

winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto instalacao_manual

rem O instalador do Node pode atualizar o PATH apenas para novas janelas.
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
call :verificar_node
if errorlevel 1 goto reiniciar_terminal
goto node_pronto

:node_pronto
echo [1/3] Node.js encontrado:
node --version
echo [2/3] Preparando o LiveForge Studio...
echo Nao ha dependencias externas do npm para instalar.

echo [3/3] Criando atalho na area de trabalho...
set "LIVEFORGE_START=%~dp0iniciar_windows.bat"
set "LIVEFORGE_DIR=%~dp0"
where powershell.exe >nul 2>nul
if errorlevel 1 goto sem_atalho
powershell.exe -NoProfile -NonInteractive -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'LiveForge Studio.lnk')); $s.TargetPath=$env:LIVEFORGE_START; $s.WorkingDirectory=$env:LIVEFORGE_DIR; $s.Description='Iniciar LiveForge Studio'; $s.Save()" >nul 2>nul
if errorlevel 1 goto sem_atalho
echo Atalho 'LiveForge Studio' criado na area de trabalho.
goto finalizado

:sem_atalho
echo Nao foi possivel criar o atalho automaticamente.
echo Voce pode usar iniciar_windows.bat para abrir o site.

:finalizado
echo.
echo =================================================
echo     INSTALACAO CONCLUIDA!
echo =================================================
echo Site local: http://localhost:3000
echo O servidor deve ficar aberto para a live funcionar.
echo.
choice /C SN /N /M "Deseja iniciar o LiveForge agora? [S/N]: "
if errorlevel 2 goto sair
call "%~dp0iniciar_windows.bat"
goto sair

:arquivos_faltando
echo [ERRO] Arquivos do LiveForge nao foram encontrados.
echo Extraia todo o ZIP primeiro e execute este BAT dentro da pasta LiveForge.
goto falha

:instalacao_manual
echo.
echo Nao foi possivel instalar o Node.js automaticamente.
echo Instale a versao LTS em https://nodejs.org/en/download
echo Depois execute instalar.bat novamente.
start "" "https://nodejs.org/en/download"
goto falha

:reiniciar_terminal
echo.
echo O instalador do Node.js foi executado, mas o comando node ainda nao esta disponivel.
echo Feche esta janela e execute instalar.bat novamente.
goto falha

:falha
echo.
pause
exit /b 1

:sair
exit /b 0

:verificar_node
set "NODE_MAJOR="
where node.exe >nul 2>nul
if errorlevel 1 exit /b 1
for /f "tokens=1 delims=v." %%V in ('node --version 2^>nul') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR exit /b 1
if %NODE_MAJOR% LSS 20 exit /b 1
exit /b 0
