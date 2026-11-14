$ErrorActionPreference = 'Stop'
$toolsPath = Join-Path $PSScriptRoot 'tools'
New-Item -ItemType Directory -Force $toolsPath | Out-Null
$versions = Get-Content "$PSScriptRoot/deploy/runtime-versions.json" -Raw | ConvertFrom-Json
if (!(Test-Path "$toolsPath/java")) {
    Invoke-WebRequest $versions.javaUrl -OutFile "$toolsPath/java.zip"
    if ((Get-FileHash "$toolsPath/java.zip" -Algorithm SHA256).Hash -ne $versions.javaSha256) { throw 'Sai checksum Java.' }
    Expand-Archive "$toolsPath/java.zip" "$toolsPath/java"
}
if (!(Test-Path "$toolsPath/keycloak-$($versions.keycloakVersion)")) {
    Invoke-WebRequest $versions.keycloakUrl -OutFile "$toolsPath/keycloak.zip"
    if ((Get-FileHash "$toolsPath/keycloak.zip" -Algorithm SHA1).Hash -ne $versions.keycloakSha1) { throw 'Sai checksum Keycloak.' }
    Expand-Archive "$toolsPath/keycloak.zip" $toolsPath
}
Write-Host 'Đã chuẩn bị Java và Keycloak trong thư mục tools. Chạy ./Start-Keycloak.ps1 để khởi động.'
