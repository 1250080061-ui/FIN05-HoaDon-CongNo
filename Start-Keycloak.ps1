$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$javaHomeFin05 = Get-ChildItem "$projectRoot/tools/java" -Directory | Select-Object -First 1 -ExpandProperty FullName
if (!$javaHomeFin05) { throw 'Thiếu Java trong tools/java.' }
$env:JAVA_HOME = $javaHomeFin05
$env:PATH = "$javaHomeFin05/bin;$env:PATH"
$kcRoot = Join-Path $projectRoot 'tools/keycloak-26.8.2'
$localRoot = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Force $localRoot | Out-Null
$credentialsPath = Join-Path $localRoot 'dev-accounts.json'
if (!(Test-Path $credentialsPath)) {
    $accounts = @(
        @{ username='admin01'; role='admin'; firstName='Quản trị'; lastName='FIN05' },
        @{ username='kinhdoanh01'; role='sales'; firstName='Kinh doanh'; lastName='FIN05' },
        @{ username='ketoan01'; role='accountant'; firstName='Kế toán'; lastName='FIN05' },
        @{ username='thutien01'; role='cashier'; firstName='Thu tiền'; lastName='FIN05' },
        @{ username='quanly01'; role='manager'; firstName='Quản lý'; lastName='FIN05' }
    )
    foreach ($account in $accounts) { $account.password = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(18)) }
    @{ accounts=$accounts; bootstrapAdmin='fin05-bootstrap'; bootstrapPassword=[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24)) } | ConvertTo-Json -Depth 8 | Set-Content $credentialsPath -Encoding utf8
}
$credentials = Get-Content $credentialsPath -Raw | ConvertFrom-Json
$accountGuide = @('TAI KHOAN THU NGHIEM FIN05 - CHI DUNG TREN MAY NAY', 'Day la mat khau KHOI TAO. Neu da doi mat khau, hay dung mat khau moi. Khong dua file nay len Git.', '')
foreach ($account in $credentials.accounts) {
    $accountGuide += @("Ten dang nhap: $($account.username)", "Vai tro: $($account.role)", "Mat khau: $($account.password)", '')
}
$accountGuide | Set-Content "$localRoot/Tai-khoan-thu-nghiem.txt" -Encoding utf8
$realm = Get-Content "$projectRoot/deploy/fin05-realm.json" -Raw | ConvertFrom-Json
$users = @($credentials.accounts | ForEach-Object {
    @{ username=$_.username; enabled=$true; emailVerified=$true; email="$($_.username)@example.com"; firstName=$_.firstName; lastName=$_.lastName; realmRoles=@($_.role); clientRoles=@{account=@('manage-account','view-profile')}; credentials=@(@{type='password';value=$_.password;temporary=$false}) }
})
$realm | Add-Member -NotePropertyName users -NotePropertyValue $users -Force
$importPath = Join-Path $kcRoot 'data/import'
New-Item -ItemType Directory -Force $importPath | Out-Null
$realm | ConvertTo-Json -Depth 30 | Set-Content "$importPath/fin05-realm.json" -Encoding utf8
$env:KC_BOOTSTRAP_ADMIN_USERNAME = $credentials.bootstrapAdmin
$env:KC_BOOTSTRAP_ADMIN_PASSWORD = $credentials.bootstrapPassword
Write-Host 'Keycloak FIN05: http://localhost:8080; tài khoản phát triển lưu trong .local/dev-accounts.json'
& "$kcRoot/bin/kc.bat" start-dev --http-host=127.0.0.1 --http-port=8080 --hostname=http://localhost:8080 --import-realm
