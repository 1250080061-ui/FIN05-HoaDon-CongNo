$ErrorActionPreference = 'Stop'
$credentials = Get-Content "$PSScriptRoot/.local/dev-accounts.json" -Raw | ConvertFrom-Json
$token = Invoke-RestMethod 'http://localhost:8080/realms/master/protocol/openid-connect/token' -Method Post -Body @{
    client_id='admin-cli'; grant_type='password'; username=$credentials.bootstrapAdmin; password=$credentials.bootstrapPassword
}
$headers = @{ Authorization="Bearer $($token.access_token)" }
$adminBase = 'http://localhost:8080/admin/realms/fin05'
$accountClient = @(Invoke-RestMethod "$adminBase/clients?clientId=account" -Headers $headers)[0]
$roles = @(
    (Invoke-RestMethod "$adminBase/clients/$($accountClient.id)/roles/manage-account" -Headers $headers),
    (Invoke-RestMethod "$adminBase/clients/$($accountClient.id)/roles/view-profile" -Headers $headers)
)
foreach ($account in $credentials.accounts) {
    $users = @(Invoke-RestMethod "$adminBase/users?username=$([uri]::EscapeDataString($account.username))&exact=true" -Headers $headers)
    if ($users.Count -ne 1) { throw "Không xác định được tài khoản $($account.username)" }
    $body = ConvertTo-Json -InputObject $roles -Depth 5
    Invoke-RestMethod "$adminBase/users/$($users[0].id)/role-mappings/clients/$($accountClient.id)" -Method Post -Headers $headers -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
    Write-Host "Đã cấp quyền quản lý tài khoản cá nhân cho $($account.username)."
}
Write-Host 'Giữ nguyên vai trò nghiệp vụ và mật khẩu. Đăng xuất rồi đăng nhập lại để nhận token có quyền mới.'
