# LiveForge Studio - configuracao do acesso publico com HTTPS no proprio IPv4
# Requer PowerShell 5.1+, Windows 10/11, winget e conexao com a Internet.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

function Say([string]$message) { Write-Host $message -ForegroundColor Cyan }
function Fail([string]$message) { Write-Host "`nERRO: $message" -ForegroundColor Red; throw $message }
function Find-Executable([string]$name, [string[]]$extras) {
    $cmd = Get-Command "$name.exe" -ErrorAction SilentlyContinue
    if ($cmd -and (Test-Path -LiteralPath $cmd.Source)) { return $cmd.Source }
    foreach ($file in $extras) {
        if ($file -and (Test-Path -LiteralPath $file -PathType Leaf)) { return $file }
    }
    if ($name -eq 'caddy') {
        foreach ($base in @((Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'), (Join-Path $env:ProgramFiles 'WinGet\Packages'))) {
            if (-not (Test-Path -LiteralPath $base)) { continue }
            $folders = Get-ChildItem -LiteralPath $base -Directory -Filter 'CaddyServer.Caddy*' -ErrorAction SilentlyContinue
            foreach ($folder in $folders) {
                $bin = Get-ChildItem -LiteralPath $folder.FullName -Recurse -File -Filter 'caddy.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($bin) { return $bin.FullName }
            }
        }
    }
    return $null
}
function Is-PublicIPv4([string]$value) {
    $parsed = $null
    if (-not [System.Net.IPAddress]::TryParse($value, [ref]$parsed)) { return $false }
    if ($parsed.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { return $false }
    $b = $parsed.GetAddressBytes()
    if ($b[0] -eq 0 -or $b[0] -eq 10 -or $b[0] -eq 127 -or $b[0] -ge 224) { return $false }
    if ($b[0] -eq 100 -and $b[1] -ge 64 -and $b[1] -le 127) { return $false }
    if ($b[0] -eq 169 -and $b[1] -eq 254) { return $false }
    if ($b[0] -eq 172 -and $b[1] -ge 16 -and $b[1] -le 31) { return $false }
    if ($b[0] -eq 192 -and $b[1] -eq 168) { return $false }
    if ($b[0] -eq 198 -and ($b[1] -eq 18 -or $b[1] -eq 19)) { return $false }
    return $true
}
function Need-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
}
function Need-Package([string]$id, [string]$description) {
    if (-not (Get-Command 'winget.exe' -ErrorAction SilentlyContinue)) {
        Fail "winget nao encontrado. Instale o App Installer da Microsoft e execute novamente. $description"
    }
    Say "Instalando $description pelo winget (pacote $id)..."
    & winget.exe install --id $id --exact --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) { Fail "O winget nao conseguiu instalar $description. Verifique os avisos acima e execute novamente." }
}

try {
    if (Need-Admin) {
        Say 'Solicitando permissao de administrador para liberar as portas 80 e 443...'
        $psArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $MyInvocation.MyCommand.Path + '"'
        $child = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $psArgs -Wait -PassThru
        exit $child.ExitCode
    }
    Write-Host ''
    Write-Host '=====================================================' -ForegroundColor DarkCyan
    Write-Host '       LIVEFORGE - INSTALADOR DE ACESSO PUBLICO' -ForegroundColor White
    Write-Host '=====================================================' -ForegroundColor DarkCyan
    Write-Host ' HTTPS no IP publico, sem dominio. O roteador e configurado manualmente.'
    Write-Host ''
    if (-not (Test-Path -LiteralPath (Join-Path $root 'server.js')) -or -not (Test-Path -LiteralPath (Join-Path $root 'public\index.html'))) {
        Fail 'Extraia todo o ZIP antes de executar este instalador.'
    }

    Say '[1/6] Verificando Node.js 20 ou superior...'
    $node = Find-Executable 'node' @((Join-Path $env:ProgramFiles 'nodejs\node.exe'), (Join-Path $env:APPDATA 'npm\node.exe'))
    $nodeMajor = 0
    if ($node) { $ver = (& $node --version).Trim(); if ($ver -match '^v(\d+)\.') { $nodeMajor = [int]$Matches[1] } }
    if ($nodeMajor -lt 20) {
        Need-Package 'OpenJS.NodeJS.LTS' 'Node.js LTS'
        $node = Find-Executable 'node' @((Join-Path $env:ProgramFiles 'nodejs\node.exe'))
        if (-not $node) { Fail 'Node instalado, mas executavel nao localizado. Feche o terminal e tente novamente.' }
        $ver = (& $node --version).Trim()
        if ($ver -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 20) { Fail 'A versao instalada do Node.js nao e compativel.' }
    }
    Write-Host " Node.js: $(& $node --version)"

    Say '[2/6] Verificando Caddy 2.11 ou mais recente...'
    $caddy = Find-Executable 'caddy' @((Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\caddy.exe'), (Join-Path $env:ProgramFiles 'Caddy\caddy.exe'), (Join-Path $env:ProgramFiles 'caddy\caddy.exe'))
    if (-not $caddy) {
        Need-Package 'CaddyServer.Caddy' 'Caddy (servidor HTTPS)'
        $caddy = Find-Executable 'caddy' @((Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\caddy.exe'), (Join-Path $env:ProgramFiles 'Caddy\caddy.exe'), (Join-Path $env:ProgramFiles 'caddy\caddy.exe'))
    }
    if (-not $caddy) { Fail 'Caddy nao localizado apos instalar. Reabra o terminal e execute novamente.' }
    $caddyVersion = (& $caddy version | Select-Object -First 1)
    if ($caddyVersion -notmatch 'v?(\d+)\.(\d+)\.(\d+)') { Fail 'Nao foi possivel identificar a versao do Caddy.' }
    if ([int]$Matches[1] -lt 2 -or ([int]$Matches[1] -eq 2 -and [int]$Matches[2] -lt 11)) {
        Fail "Caddy $caddyVersion e antigo para certificados IP. Atualize para 2.11+ e tente novamente."
    }
    Write-Host " Caddy: $caddyVersion"

    Say '[3/6] Identificando seu IP publico IPv4...'
    $detected = ''
    try { $detected = [string](Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 10 -ErrorAction Stop) } catch {
        Write-Host ' Nao foi possivel detectar o IP automaticamente. Voce pode digitar manualmente.' -ForegroundColor Yellow
    }
    if (-not (Is-PublicIPv4 $detected)) { $detected = '' }
    if ($detected) { Write-Host " Detectado: $detected" }
    $answer = if ($detected) { Read-Host "Digite outro IP ou pressione ENTER para usar $detected" } else { Read-Host 'Digite seu IPv4 publico (WAN)' }
    $publicIp = if ($answer) { $answer.Trim() } else { $detected }
    if (-not (Is-PublicIPv4 $publicIp)) { Fail 'Endereco informado nao e um IPv4 publico valido. Confira o IP WAN do AX3000.' }
    Write-Host " Publicacao: https://$publicIp"
    Write-Host ' Confirme que o IP WAN mostrado no AX3000 e o mesmo informado acima.' -ForegroundColor Yellow
    Write-Host ' Se a operadora bloquear a porta 80 ou 443, o certificado nao sera emitido.' -ForegroundColor Yellow
    $confirm = Read-Host 'O IP WAN do roteador confere? [S/N]'
    if ($confirm.Trim().ToUpper() -notin @('S','SIM')) { Fail 'Instalacao interrompida para verificar o IP WAN.' }

    Say '[4/6] Gerando configuracao segura...'
    # Para IP publico o Let's Encrypt exige o perfil shortlived (cerca de 6 dias).
    $caddyText = @"
{
    admin off
}

$publicIp {
    tls {
        issuer acme {
            profile shortlived
        }
    }
    encode zstd gzip
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy no-referrer
        X-Frame-Options DENY
    }
    reverse_proxy 127.0.0.1:3000
}
"@
    $caddyFile = Join-Path $root 'Caddyfile.publico'
    [System.IO.File]::WriteAllText($caddyFile, $caddyText, (New-Object System.Text.UTF8Encoding($false)))
    & $caddy validate --config $caddyFile --adapter caddyfile
    if ($LASTEXITCODE -ne 0) { Fail 'A configuracao do Caddy nao passou na validacao.' }
    # O backend fica APENAS na interface de loopback. Nunca abre a porta 3000 no roteador.
    $cmdConfig = @(
        '@echo off',
        'set "LIVEFORGE_PUBLIC_IP=' + $publicIp + '"',
        'set "LIVEFORGE_NODE=' + $node + '"',
        'set "LIVEFORGE_CADDY=' + $caddy + '"'
    ) -join "`r`n"
    [System.IO.File]::WriteAllText((Join-Path $root '.liveforge-publico.cmd'), ($cmdConfig + "`r`n"), [System.Text.Encoding]::Default)

    Say '[5/6] Configurando Firewall do Windows (somente TCP 80 e 443)...'
    foreach ($port in @(80, 443)) {
        $rule = "LiveForge Studio HTTPS TCP $port"
        if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any | Out-Null
        }
        Write-Host " Firewall: porta TCP $port liberada"
    }
    Say '[6/6] Criando atalho na area de trabalho...'
    try {
        $shell = New-Object -ComObject WScript.Shell
        $desktop = [Environment]::GetFolderPath('Desktop')
        $shortcut = $shell.CreateShortcut((Join-Path $desktop 'LiveForge Publico.lnk'))
        $shortcut.TargetPath = Join-Path $root 'iniciar_publico.bat'
        $shortcut.WorkingDirectory = $root
        $shortcut.Description = 'Iniciar a live com HTTPS em IP publico'
        $shortcut.Save()
    } catch { Write-Host ' Nao foi possivel criar atalho; use iniciar_publico.bat.' -ForegroundColor Yellow }

    Write-Host ''
    Write-Host '================== PRONTO ==================' -ForegroundColor Green
    Write-Host 'No AX3000, encaminhe TCP 80 -> IP local do PC, porta 80' -ForegroundColor White
    Write-Host 'No AX3000, encaminhe TCP 443 -> IP local do PC, porta 443' -ForegroundColor White
    try {
        $ips = @(Get-NetIPConfiguration -ErrorAction Stop | Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' } | ForEach-Object { $_.IPv4Address.IPAddress } | Where-Object { $_ -notlike '169.254.*' })
        if ($ips.Count) { Write-Host ('IPv4 local possivel: ' + ($ips -join ', ')) -ForegroundColor White }
    } catch {}
    Write-Host "URL publica: https://$publicIp" -ForegroundColor Green
    Write-Host 'Studio no seu PC: http://localhost:3000' -ForegroundColor Green
    Write-Host 'O link de cada sala sera gerado automaticamente com o seu IP publico.'
    Write-Host ''
    Write-Host 'IMPORTANTE: execute iniciar_publico.bat e mantenha as janelas abertas.' -ForegroundColor Yellow
    Write-Host 'O certificado publico depende do acesso externo as portas 80/443.' -ForegroundColor Yellow
    Write-Host 'Para testar, use um celular em 4G/5G (Wi-Fi desligado).' -ForegroundColor Yellow
    Write-Host 'Se o IP publico mudar, execute este instalador novamente.' -ForegroundColor Yellow
    Write-Host 'Com STUN pode funcionar P2P; alguns amigos precisarao de TURN.' -ForegroundColor Yellow
    $startNow = Read-Host 'Iniciar o LiveForge agora? [S/N]'
    if ($startNow.Trim().ToUpper() -in @('S','SIM')) {
        Start-Process -FilePath (Join-Path $root 'iniciar_publico.bat') -WorkingDirectory $root
    }
    exit 0
} catch {
    Write-Host "`nA instalacao nao foi concluida: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host 'Pressione ENTER para fechar'
    exit 1
}
