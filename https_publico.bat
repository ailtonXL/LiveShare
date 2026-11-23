@echo off
setlocal
chcp 65001 >nul 2>nul
cd /d "%~dp0"
call "%~dp0.liveforge-publico.cmd"
echo Caddy HTTPS - https://%LIVEFORGE_PUBLIC_IP%
echo Certificado publico IP valido exige portas TCP 80/443 encaminhadas.
echo Nao feche esta janela: renovacao HTTPS depende do Caddy ativo.
echo.
"%LIVEFORGE_CADDY%" run --config "%~dp0Caddyfile.publico" --adapter caddyfile
echo.
echo O proxy HTTPS encerrou ou houve um erro.
pause
