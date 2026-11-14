$ErrorActionPreference = 'Stop'
$fin05Credentials = Get-Content "$PSScriptRoot/.local/dev-accounts.json" -Raw | ConvertFrom-Json
$fin05Token = Invoke-RestMethod 'http://localhost:8080/realms/master/protocol/openid-connect/token' -Method Post -Body @{
    client_id='admin-cli'; grant_type='password'; username=$fin05Credentials.bootstrapAdmin; password=$fin05Credentials.bootstrapPassword
}
$fin05Headers = @{ Authorization="Bearer $($fin05Token.access_token)" }
$fin05Base = 'http://localhost:8080/admin/realms/fin05'
function Send-Fin05Json($Uri, $Method, $Data) {
    Invoke-RestMethod $Uri -Headers $fin05Headers -Method $Method -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $Data -Depth 15)))
}
$fin05Client = Invoke-RestMethod "$fin05Base/clients?clientId=fin05-user-admin" -Headers $fin05Headers
if (!$fin05Client) {
    Send-Fin05Json "$fin05Base/clients" Post @{ clientId='fin05-user-admin'; name='FIN05 user administration'; enabled=$true; publicClient=$false; serviceAccountsEnabled=$true; standardFlowEnabled=$false; directAccessGrantsEnabled=$false; protocol='openid-connect' } | Out-Null
    $fin05Client = Invoke-RestMethod "$fin05Base/clients?clientId=fin05-user-admin" -Headers $fin05Headers
}
if ($fin05Client.Count -ne 1) { throw 'Không xác định được client quản trị người dùng.' }
$fin05Scopes = Invoke-RestMethod "$fin05Base/client-scopes" -Headers $fin05Headers
$fin05AdminScope = $fin05Scopes | Where-Object { $_.name -eq 'kc-admin-api' }
if (!$fin05AdminScope) { throw 'Thiếu client scope kc-admin-api của Keycloak.' }
Invoke-RestMethod "$fin05Base/clients/$($fin05Client[0].id)/default-client-scopes/$($fin05AdminScope.id)" -Method Put -Headers $fin05Headers | Out-Null
$fin05Service = Invoke-RestMethod "$fin05Base/clients/$($fin05Client[0].id)/service-account-user" -Headers $fin05Headers
$fin05Management = @(Invoke-RestMethod "$fin05Base/clients?clientId=realm-management" -Headers $fin05Headers)[0]
$fin05Roles = @('query-users','view-users','manage-users','view-clients','view-realm') | ForEach-Object { Invoke-RestMethod "$fin05Base/clients/$($fin05Management.id)/roles/$_" -Headers $fin05Headers }
Send-Fin05Json "$fin05Base/users/$($fin05Service.id)/role-mappings/clients/$($fin05Management.id)" Post @($fin05Roles) | Out-Null
$fin05Secret = Invoke-RestMethod "$fin05Base/clients/$($fin05Client[0].id)/client-secret" -Headers $fin05Headers
@{ KeycloakAdmin=@{ ClientId='fin05-user-admin'; ClientSecret=$fin05Secret.value } } | ConvertTo-Json -Depth 5 | Set-Content "$PSScriptRoot/.local/keycloak-admin.json" -Encoding utf8
Write-Host 'Đã cấu hình service account quản lý người dùng trong realm fin05. Secret chỉ lưu trong .local/keycloak-admin.json.'
