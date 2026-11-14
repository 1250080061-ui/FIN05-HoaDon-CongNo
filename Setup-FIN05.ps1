[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/scripts/Require-PowerShell7.ps1"
Use-Fin05PowerShell7 -ScriptPath $PSCommandPath -ScriptParameters $PSBoundParameters
foreach ($fin05Command in @('dotnet.exe','node.exe','npm.cmd','sqlcmd.exe')) {
    if (!(Get-Command $fin05Command -ErrorAction SilentlyContinue)) { throw "Thiếu $fin05Command. Xem deploy/HANDOFF.md để cài điều kiện trước." }
}
try { $fin05Running = Invoke-WebRequest 'http://localhost:5068/' -TimeoutSec 2 -SkipHttpErrorCheck } catch { $fin05Running = $null }
if ($fin05Running) { throw 'Cổng 5068 đang có dịch vụ. Setup dành cho lần cài mới khi API đã dừng; nếu chỉ chạy lại, dùng Start-FIN05.ps1.' }
function Run-Fin05Command([string]$Exe, [string[]]$Arguments) {
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Không hoàn tất lệnh $Exe. Kiểm tra thông báo ở trên trước khi chạy tiếp." }
}
Push-Location $PSScriptRoot
try {
    & sqlcmd -S localhost -E -C -d master -l 5 -t 5 -b -Q 'SET NOCOUNT ON; SELECT 1;' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Chưa kết nối SQL Server localhost bằng Windows Authentication. Kiểm tra dịch vụ SQL Server và quyền tạo CSDL FIN05.' }
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    Run-Fin05Command 'dotnet.exe' @('tool','restore')
    Run-Fin05Command 'dotnet.exe' @('restore','backend/Fin05.Api')
    Run-Fin05Command 'dotnet.exe' @('ef','database','update','--project','backend/Fin05.Api')
    Push-Location frontend
    try { Run-Fin05Command 'npm.cmd' @('ci') } finally { Pop-Location }
    & "$PSScriptRoot/Install-Keycloak.ps1"
    $fin05RealmUrl = 'http://localhost:8080/realms/fin05/.well-known/openid-configuration'
    try { $fin05Kc = Invoke-WebRequest $fin05RealmUrl -TimeoutSec 2 -SkipHttpErrorCheck } catch { $fin05Kc = $null }
    if (!$fin05Kc) {
        New-Item -ItemType Directory -Force "$PSScriptRoot/.local" | Out-Null
        Start-Process (Get-Process -Id $PID).Path -ArgumentList @('-NoProfile','-File',('"{0}"' -f "$PSScriptRoot/Start-Keycloak.ps1")) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput "$PSScriptRoot/.local/keycloak.out.log" -RedirectStandardError "$PSScriptRoot/.local/keycloak.err.log" | Out-Null
        for ($fin05Attempt=0; $fin05Attempt -lt 60; $fin05Attempt++) {
            try { $fin05Kc = Invoke-WebRequest $fin05RealmUrl -TimeoutSec 2 -SkipHttpErrorCheck } catch { $fin05Kc = $null }
            if ($fin05Kc -and $fin05Kc.StatusCode -eq 200) { break }
            Start-Sleep -Seconds 1
        }
    }
    if (!$fin05Kc -or $fin05Kc.StatusCode -ne 200 -or ($fin05Kc.Content | ConvertFrom-Json).issuer -ne 'http://localhost:8080/realms/fin05') { throw 'Realm fin05 chưa sẵn sàng hoặc cổng 8080 đang có dịch vụ khác. Xem .local/keycloak.*.log.' }
    & "$PSScriptRoot/Configure-UserAdministration.ps1"
    & "$PSScriptRoot/Start-FIN05.ps1"
    Write-Host 'Khởi tạo đã hoàn tất. Chạy Check-FIN05.ps1 để kiểm tra. Không chia sẻ .local hoặc tools/keycloak-*/data.'
} finally { Pop-Location }
