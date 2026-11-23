$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$p = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $args = '-NoProfile -ExecutionPolicy Bypass -File "' + $MyInvocation.MyCommand.Path + '"'
    $proc = Start-Process powershell.exe -Verb RunAs -ArgumentList $args -Wait -PassThru
    exit $proc.ExitCode
}
Get-NetFirewallRule -DisplayName 'LiveForge Studio HTTP TCP 3000' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Write-Host 'Regra de firewall TCP 3000 do LiveForge removida.'
Write-Host 'Remova tambem a regra de encaminhamento no AX3000 manualmente.'
Read-Host 'Pressione ENTER para fechar'
