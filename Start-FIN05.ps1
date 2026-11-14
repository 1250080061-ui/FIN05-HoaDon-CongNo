$ErrorActionPreference = 'Stop'
$fin05PowerShell = Get-Command pwsh.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
if (!$fin05PowerShell -and (Test-Path -LiteralPath "$env:ProgramFiles/PowerShell/7/pwsh.exe")) { $fin05PowerShell = "$env:ProgramFiles/PowerShell/7/pwsh.exe" }
if (!$fin05PowerShell) {
    $fin05PowerShell = Get-ChildItem "$env:ProgramFiles/WindowsApps/OpenAI.CodexPrimaryRuntime.*/dependencies/native/powershell/pwsh.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}
if ($PSVersionTable.PSVersion.Major -lt 7) {
    if (!$fin05PowerShell) { throw 'Không tìm thấy PowerShell 7. Hãy cài PowerShell 7 rồi chạy lại.' }
    & $fin05PowerShell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath
    exit $LASTEXITCODE
}
$rootPath = $PSScriptRoot
$logRoot = Join-Path $rootPath '.local'
New-Item -ItemType Directory -Force $logRoot | Out-Null
function Probe([string]$Url) {
    try { return Invoke-WebRequest $Url -TimeoutSec 3 -SkipHttpErrorCheck } catch { return $null }
}
function Wait-Endpoint([string]$Url) {
    for ($attempt=0; $attempt -lt 60; $attempt++) {
        $response = Probe $Url
        if ($response -and $response.StatusCode -eq 200) { return $response }
        Start-Sleep -Seconds 1
    }
    throw "Không khởi động được $Url. Xem log trong .local."
}
$kc = Probe 'http://localhost:8080/realms/fin05/.well-known/openid-configuration'
if (!$kc -or $kc.StatusCode -ne 200) {
    $psPath = (Get-Process -Id $PID).Path
    Start-Process $psPath -ArgumentList @('-NoProfile','-File', ('"{0}"' -f (Join-Path $rootPath 'Start-Keycloak.ps1'))) -WorkingDirectory $rootPath -WindowStyle Hidden -RedirectStandardOutput "$logRoot/keycloak.out.log" -RedirectStandardError "$logRoot/keycloak.err.log" | Out-Null
    $kc = Wait-Endpoint 'http://localhost:8080/realms/fin05/.well-known/openid-configuration'
}
if (($kc.Content | ConvertFrom-Json).issuer -ne 'http://localhost:8080/realms/fin05') { throw 'Cổng 8080 đang chạy dịch vụ khác.' }
$api = Probe 'http://localhost:5068/'
if (!$api) {
    Start-Process (Get-Command dotnet.exe).Source -ArgumentList @('run','--project','backend/Fin05.Api','--launch-profile','http') -WorkingDirectory $rootPath -WindowStyle Hidden -RedirectStandardOutput "$logRoot/api.out.log" -RedirectStandardError "$logRoot/api.err.log" | Out-Null
    $api = Wait-Endpoint 'http://localhost:5068/'
}
if (($api.Content | ConvertFrom-Json).application -ne 'FIN-05') { throw 'Cổng 5068 đang chạy dịch vụ khác.' }
$web = Probe 'http://localhost:5173/'
if (!$web) {
    $vitePath = Join-Path $rootPath 'frontend/node_modules/vite/bin/vite.js'
    $nodePath = Join-Path $env:ProgramFiles 'nodejs/node.exe'
    Start-Process $nodePath -ArgumentList @(('"{0}"' -f $vitePath),'--port','5173','--strictPort') -WorkingDirectory "$rootPath/frontend" -WindowStyle Hidden -RedirectStandardOutput "$logRoot/web.out.log" -RedirectStandardError "$logRoot/web.err.log" | Out-Null
    $web = Wait-Endpoint 'http://localhost:5173/'
}
if ($web.Content -notmatch 'FIN05') { throw 'Cổng 5173 đang chạy ứng dụng khác.' }
Write-Host 'FIN05 đã sẵn sàng: http://localhost:5173'
Write-Host 'Tài khoản thử nghiệm: .local/dev-accounts.json (không đưa file này lên Git).'
