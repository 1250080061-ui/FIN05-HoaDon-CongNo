[CmdletBinding()]
param([string]$SqlServer = 'localhost', [string]$Database = 'FIN05')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/scripts/Require-PowerShell7.ps1"
Use-Fin05PowerShell7 -ScriptPath $PSCommandPath -ScriptParameters $PSBoundParameters
$fin05Results = [Collections.Generic.List[object]]::new()
function Add-Check($Name, $Status, $Detail) { $fin05Results.Add([pscustomobject]@{ Check=$Name; Status=$Status; Detail=$Detail }) }
foreach ($fin05Command in @('dotnet.exe','node.exe','sqlcmd.exe')) {
    if (Get-Command $fin05Command -ErrorAction SilentlyContinue) { Add-Check $fin05Command 'OK' 'Có trong môi trường hiện tại' }
    else { Add-Check $fin05Command 'FAIL' 'Chưa tìm thấy trong PATH; kiểm tra cài đặt và mở lại Terminal' }
}
if (Get-Command dotnet.exe -ErrorAction SilentlyContinue) {
    $fin05Sdk = & dotnet --list-sdks
    Add-Check '.NET SDK 10' $(if ($fin05Sdk -match '^10\.') { 'OK' } else { 'FAIL' }) 'Dự án nhắm net10.0; cần SDK 10 và runtime ASP.NET Core 10'
    $fin05Runtimes = & dotnet --list-runtimes
    Add-Check 'ASP.NET Core 10' $(if ($fin05Runtimes -match '^Microsoft.AspNetCore.App 10\.') { 'OK' } else { 'FAIL' }) 'Runtime dùng để chạy API'
}
if (Get-Command node.exe -ErrorAction SilentlyContinue) {
    $fin05NodeVersion = (& node --version).Trim()
    $fin05NodeParts = $fin05NodeVersion.TrimStart('v').Split('.')
    $fin05NodeOK = ([int]$fin05NodeParts[0] -eq 20 -and [int]$fin05NodeParts[1] -ge 19) -or ([int]$fin05NodeParts[0] -eq 22 -and [int]$fin05NodeParts[1] -ge 12) -or [int]$fin05NodeParts[0] -gt 22
    Add-Check 'Node.js cho Vite' $(if ($fin05NodeOK) { 'OK' } else { 'FAIL' }) $fin05NodeVersion
}
if (Get-Command sqlcmd.exe -ErrorAction SilentlyContinue) {
    & sqlcmd -S $SqlServer -E -C -d $Database -l 5 -t 5 -b -Q 'SET NOCOUNT ON; SELECT 1;' *> $null
    Add-Check 'SQL Server / CSDL' $(if ($LASTEXITCODE -eq 0) { 'OK' } else { 'FAIL' }) "$SqlServer / $Database, Windows Authentication"
    if ($LASTEXITCODE -eq 0) {
        $fin05Expected = Get-ChildItem "$PSScriptRoot/backend/Fin05.Api/Migrations" -File | Where-Object Name -Match '^\d{14}_.*(?<!\.Designer)\.cs$' | Sort-Object Name | Select-Object -Last 1
        $fin05Applied = (& sqlcmd -S $SqlServer -E -C -d $Database -I -l 5 -t 5 -b -h -1 -W -Q 'SET NOCOUNT ON; SELECT TOP(1) MigrationId FROM dbo.__EFMigrationsHistory ORDER BY MigrationId DESC;' 2>$null) -join ''
        Add-Check 'Migration mới nhất' $(if ($LASTEXITCODE -eq 0 -and $fin05Applied.Trim() -eq $fin05Expected.BaseName) { 'OK' } else { 'FAIL' }) $fin05Expected.BaseName
        $fin05Pending = (& sqlcmd -S $SqlServer -E -C -d $Database -I -l 5 -t 5 -b -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM dbo.UserAdminOperations WHERE Status<>'Completed';" 2>$null) -join ''
        Add-Check 'Tác vụ quản trị' $(if ($LASTEXITCODE -eq 0 -and $fin05Pending.Trim() -eq '0') { 'OK' } else { 'WARN' }) 'Nếu có tác vụ chưa hoàn tất, vào Người dùng để đối chiếu/thử lại'
    }
}
foreach ($fin05Endpoint in @(
    @{ Name='Keycloak'; Url='http://localhost:8080/realms/fin05/.well-known/openid-configuration'; Kind='Keycloak' },
    @{ Name='FIN05 API'; Url='http://localhost:5068/'; Kind='API' },
    @{ Name='Giao diện'; Url='http://localhost:5173/'; Kind='Web' }
)) {
    try {
        $fin05Reply = Invoke-WebRequest $fin05Endpoint.Url -TimeoutSec 5 -SkipHttpErrorCheck
        $fin05Matches = $fin05Reply.StatusCode -eq 200
        if ($fin05Matches -and $fin05Endpoint.Kind -eq 'Keycloak') { $fin05Matches = ($fin05Reply.Content | ConvertFrom-Json).issuer -eq 'http://localhost:8080/realms/fin05' }
        if ($fin05Matches -and $fin05Endpoint.Kind -eq 'API') { $fin05Matches = ($fin05Reply.Content | ConvertFrom-Json).application -eq 'FIN-05' }
        if ($fin05Matches -and $fin05Endpoint.Kind -eq 'Web') { $fin05Matches = $fin05Reply.Content -match 'FIN05' }
        Add-Check $fin05Endpoint.Name $(if ($fin05Matches) { 'OK' } else { 'FAIL' }) $fin05Endpoint.Url
    } catch { Add-Check $fin05Endpoint.Name 'FAIL' 'Chưa truy cập được; chạy Start-FIN05.ps1 nếu dịch vụ đang tắt' }
}
$fin05AdminPath = "$PSScriptRoot/.local/keycloak-admin.json"
if (Test-Path -LiteralPath $fin05AdminPath) {
    try {
        $fin05Admin = Get-Content $fin05AdminPath -Raw | ConvertFrom-Json
        $fin05Auth = Invoke-RestMethod 'http://localhost:8080/realms/fin05/protocol/openid-connect/token' -Method Post -TimeoutSec 5 -Body @{ grant_type='client_credentials'; client_id=$fin05Admin.KeycloakAdmin.ClientId; client_secret=$fin05Admin.KeycloakAdmin.ClientSecret }
        $fin05AdminReply = Invoke-WebRequest 'http://localhost:8080/admin/realms/fin05/users/count' -Headers @{ Authorization="Bearer $($fin05Auth.access_token)" } -TimeoutSec 5 -SkipHttpErrorCheck
        Add-Check 'Kết nối quản trị UC13' $(if ($fin05AdminReply.StatusCode -eq 200) { 'OK' } else { 'FAIL' }) 'Kiểm tra token và quyền đọc; không in secret hoặc token'
    } catch { Add-Check 'Kết nối quản trị UC13' 'FAIL' 'Kiểm tra Configure-UserAdministration.ps1 và khởi động lại API sau khi cấu hình' }
} else { Add-Check 'Kết nối quản trị UC13' 'WARN' 'Chưa có cấu hình secret cục bộ; cần cấu hình trước khi dùng quản trị người dùng' }
$fin05Results | Format-Table -AutoSize -Wrap
if ($fin05Results.Status -contains 'FAIL') { exit 1 }
exit 0
