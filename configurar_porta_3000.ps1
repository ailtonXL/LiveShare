# LiveForge Studio: opcao simples HTTP em uma unica porta TCP 3000.
# Compartilhamento de tela SOMENTE pelo http://localhost:3000 no computador transmissor.
# Uso para testes particulares: sinalizacao HTTP sem criptografia.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

function Info([string]$msg) { Write-Host $msg -ForegroundColor Cyan }
function Fail([string]$msg) { throw $msg }
function AdminRequired {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($identity)
    return -not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function LocateNode {
    $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($cmd -and (Test-Path -LiteralPath $cmd.Source -PathType Leaf)) { return $cmd.Source }
    $paths = @((Join-Path $env:ProgramFiles 'nodejs\node.exe'))
    if (${env:ProgramFiles(x86)}) { $paths += (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe') }
    foreach ($possible in $paths) {
        if ($possible -and (Test-Path -LiteralPath $possible -PathType Leaf)) { return $possible }
    }
    return $null
}
function IsPublicIPv4([string]$ip) {
    $parsed = $null
    if (-not [System.Net.IPAddress]::TryParse($ip, [ref]$parsed)) { return $false }
    if ($parsed.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { return $false }
    $a = $parsed.GetAddressBytes()
    if ($a[0] -eq 0 -or $a[0] -eq 10 -or $a[0] -eq 127 -or $a[0] -ge 224) { return $false }
    if ($a[0] -eq 100 -and $a[1] -ge 64 -and $a[1] -le 127) { return $false }
    if ($a[0] -eq 169 -and $a[1] -eq 254) { return $false }
    if ($a[0] -eq 172 -and $a[1] -ge 16 -and $a[1] -le 31) { return $false }
    if ($a[0] -eq 192 -and $a[1] -eq 168) { return $false }
    if ($a[0] -eq 198 -and ($a[1] -eq 18 -or $a[1] -eq 19)) { return $false }
    return $true
}
try {
    if (AdminRequired) {
        Info 'Solicitando autorizacao de administrador para a regra TCP 3000...'
        $args = '-NoProfile -ExecutionPolicy Bypass -File "' + $MyInvocation.MyCommand.Path + '"'
        $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $args -Wait -PassThru
        exit $p.ExitCode
    }
    Write-Host ''
    Write-Host '=========================================================' -ForegroundColor DarkCyan
    Write-Host '     LIVEFORGE - INSTALACAO SOMENTE PORTA TCP 3000' -ForegroundColor White
    Write-Host '=========================================================' -ForegroundColor DarkCyan
    Write-Host 'Este modo publica HTTP SEM criptografia. Use so para' -ForegroundColor Yellow
    Write-Host 'testes privados e nao abra o estudio pelo IP publico.' -ForegroundColor Yellow
    Write-Host ''
    if (-not (Test-Path -LiteralPath (Join-Path $root 'server.js'))) { Fail 'server.js nao encontrado. Extraia todo o ZIP primeiro.' }
    if (-not (Test-Path -LiteralPath (Join-Path $root 'public\index.html'))) { Fail 'public/index.html nao encontrado.' }

    Info '[1/5] Verificando Node.js (versao 20+)...'
    $node = LocateNode
    $major = 0
    if ($node) {
        $ver = [string](& $node --version)
        if ($ver.Trim() -match '^v(\d+)\.') { $major = [int]$Matches[1] }
    }
    if ($major -lt 20) {
        if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) { Fail 'Node.js 20+ nao instalado e winget nao encontrado. Instale Node.js LTS em https://nodejs.org e tente novamente.' }
        Info 'Instalando Node.js LTS usando winget...'
        & winget.exe install --id OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity
        if ($LASTEXITCODE -ne 0) { Fail 'Falha ao instalar Node.js via winget. Instale manualmente por https://nodejs.org e execute novamente.' }
        $node = LocateNode
        if (-not $node) { Fail 'Node.js instalado mas nao localizado. Feche e abra o instalador novamente.' }
        $ver = [string](& $node --version)
        if ($ver.Trim() -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 20) { Fail 'Node.js instalado, mas nao e versao 20+.' }
    }
    Write-Host " Node.js: $(& $node --version)"

    Info '[2/5] Identificando IPv4 publico para o link do amigo...'
    $detected = ''
    try { $detected = ([string](Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 10)).Trim() }
    catch { Write-Host ' Nao consegui detectar; informe o IP WAN manualmente.' -ForegroundColor Yellow }
    if (-not (IsPublicIPv4 $detected)) { $detected = '' }
    if ($detected) { Write-Host " IP detectado: $detected" }
    $typed = if ($detected) { Read-Host 'ENTER para usar esse IP, ou digite outro IPv4 publico' } else { Read-Host 'Digite seu IPv4 publico (o IP WAN no AX3000)' }
    $ip = if ($typed -and $typed.Trim()) { $typed.Trim() } else { $detected }
    if (-not (IsPublicIPv4 $ip)) { Fail 'IPv4 publico invalido. Confirme o IP WAN do roteador.' }
    Write-Host " Link esperado: http://${ip}:3000/?watch=CODIGO"
    Write-Host 'Verifique se o IPv4 WAN do AX3000 e igual ao IP detectado.' -ForegroundColor Yellow
    $ok = Read-Host 'O IPv4 WAN do AX3000 confere com esse IP? [S/N]'
    if ($ok.Trim().ToUpper() -notin @('S','SIM')) { Fail 'Instalacao interrompida ate confirmar o IP WAN do roteador.' }

    Info '[3/5] Salvando modo HTTP na porta 3000...'
    $settings = @(
       '@echo off',
       'set "LIVEFORGE_PUBLIC_IP=' + $ip + '"',
       'set "LIVEFORGE_NODE=' + $node + '"'
    ) -join "`r`n"
    [System.IO.File]::WriteAllText((Join-Path $root '.liveforge-porta3000.cmd'), ($settings + "`r`n"), [System.Text.Encoding]::Default)

    Info '[4/5] Liberando apenas TCP 3000 no Firewall do Windows...'
    $ruleName = 'LiveForge Studio HTTP TCP 3000'
    # Regra exclusiva desta aplicacao; evita criar duplicatas a cada instalacao.
    Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 3000 -Program $node -Action Allow -Profile Any | Out-Null
    Write-Host ' Regra criada: LiveForge Studio HTTP TCP 3000 (Node.js)'

    Info '[5/5] Criando atalho LiveForge Porta 3000 na area de trabalho...'
    try {
        $shell = New-Object -ComObject WScript.Shell
        $dest = Join-Path ([Environment]::GetFolderPath('Desktop')) 'LiveForge Porta 3000.lnk'
        $link = $shell.CreateShortcut($dest)
        $link.TargetPath = Join-Path $root 'iniciar_porta_3000.bat'
        $link.WorkingDirectory = $root
        $link.Description = 'LiveForge: emitir pelo localhost e assistir por IP publico na porta 3000'
        $link.Save()
        Write-Host ' Atalho criado.'
    } catch { Write-Host ' Atalho nao criado; use iniciar_porta_3000.bat.' -ForegroundColor Yellow }

    Write-Host ''
    Write-Host '================== INSTALADO ==================' -ForegroundColor Green
    Write-Host 'No AX3000: encaminhe SOMENTE TCP 3000 -> porta 3000 do IP local do PC.'
    try {
        $ips = @(Get-NetIPConfiguration -ErrorAction Stop | Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' } | ForEach-Object { $_.IPv4Address.IPAddress } | Where-Object { $_ -notlike '169.254.*' })
        if ($ips.Count) { Write-Host "Possiveis IPs locais do PC: $($ips -join ', ')" }
    } catch { }
    Write-Host ''
    Write-Host 'TRANSMISSOR: http://localhost:3000' -ForegroundColor Green
    Write-Host "ESPECTADOR: http://${ip}:3000/?watch=CODIGO" -ForegroundColor Yellow
    Write-Host 'Execute iniciar_porta_3000.bat para iniciar o servidor.'
    Write-Host ''
    Write-Host 'IMPORTANTE: nao ha HTTPS. Sinalizacao e paginas trafegam sem TLS.' -ForegroundColor Yellow
    Write-Host 'Se a pagina abrir mas o video nao funcionar, pode ser necessario TURN.' -ForegroundColor Yellow
    Write-Host 'O instalador NAO altera as regras do roteador.'
    Write-Host 'Caso use o modo HTTPS anterior, pare o Caddy, remova regras antigas' -ForegroundColor Yellow
    Write-Host 'e remova os encaminhamentos 80/443 do roteador se nao precisar.' -ForegroundColor Yellow
    Read-Host 'Pressione ENTER para terminar'
    exit 0
} catch {
    Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host 'Pressione ENTER para fechar'
    exit 1
}
