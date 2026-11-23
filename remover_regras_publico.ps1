$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$p = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $args = '-NoProfile -ExecutionPolicy Bypass -File "' + $MyInvocation.MyCommand.Path + '"'
    $proc = Start-Process powershell.exe -Verb RunAs -ArgumentList $args -Wait -PassThru
    exit $proc.ExitCode
}
foreach ($port in @(80,443)) {
    $name = "LiveForge Studio HTTPS TCP $port"
    Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Write-Host "Regra $name removida (se existia)."
}
Write-Host 'Nenhuma outra regra foi alterada. O roteador deve ser alterado separadamente.'
Read-Host 'Pressione ENTER para fechar'
