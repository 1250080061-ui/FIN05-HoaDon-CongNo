[CmdletBinding()]
param([string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/scripts/Require-PowerShell7.ps1"
Use-Fin05PowerShell7 -ScriptPath $PSCommandPath -ScriptParameters $PSBoundParameters
if (!$OutputDirectory) { $OutputDirectory = Join-Path $PSScriptRoot '../handoff' }
$fin05Root = [IO.Path]::GetFullPath($PSScriptRoot)
$fin05Output = [IO.Path]::GetFullPath($OutputDirectory)
if ($fin05Output.Equals($fin05Root,[StringComparison]::OrdinalIgnoreCase) -or $fin05Output.StartsWith($fin05Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Chọn thư mục xuất ngoài FIN05 để không đóng gói lồng nhau.' }
$fin05Files = [Collections.Generic.List[object]]::new()
function Include-Fin05File([IO.FileInfo]$File) {
    if ($File.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Không đóng gói liên kết filesystem.' }
    $fin05Parent = $File.Directory
    while ($fin05Parent -and !$fin05Parent.FullName.Equals($fin05Root,[StringComparison]::OrdinalIgnoreCase)) {
        if ($fin05Parent.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Không đóng gói tệp nằm trong thư mục liên kết.' }
        $fin05Parent = $fin05Parent.Parent
    }
    $fin05Relative = [IO.Path]::GetRelativePath($fin05Root,$File.FullName).Replace('\','/')
    if ($fin05Relative -match '(^|/)(\.local|tools|node_modules|bin|obj|dist|test-results|playwright-report|\.git)(/|$)' -or $fin05Relative -match '\.template-backup$') { return }
    $fin05Files.Add([pscustomobject]@{ Relative=$fin05Relative; File=$File })
}
# Explicit source categories; do not archive arbitrary hidden files or environment files.
Get-ChildItem $fin05Root -File | Where-Object { $_.Extension -in @('.ps1','.md') -or $_.Name -in @('.gitignore','dotnet-tools.json') } | ForEach-Object { Include-Fin05File $_ }
foreach ($fin05Tree in @('backend','frontend/src','frontend/tests','frontend/public','tests','scripts','deploy')) {
    $fin05TreePath = Join-Path $fin05Root $fin05Tree
    if (!(Test-Path -LiteralPath $fin05TreePath)) { continue }
    Get-ChildItem $fin05TreePath -Recurse -File | ForEach-Object {
        $fin05Relative = [IO.Path]::GetRelativePath($fin05Root,$_.FullName).Replace('\','/')
        $fin05Allowed = $false
        if ($fin05Tree -eq 'backend') { $fin05Allowed = $_.Extension -in @('.cs','.csproj') -or $_.Name -in @('appsettings.json','appsettings.Development.json','launchSettings.json') }
        elseif ($fin05Tree -eq 'deploy') { $fin05Allowed = $_.Extension -in @('.md','.sql') -or $_.Name -in @('fin05-realm.json','runtime-versions.json') }
        elseif ($fin05Tree -in @('scripts','tests')) { $fin05Allowed = $_.Extension -eq '.ps1' }
        else { $fin05Allowed = $_.Extension -in @('.ts','.tsx','.css','.svg','.png','.ico','.jpg','.jpeg','.webp') }
        if ($fin05Allowed -and $fin05Relative -notmatch '/appsettings\.Local\.json$') { Include-Fin05File $_ }
    }
}
Get-ChildItem "$fin05Root/frontend" -File | Where-Object { $_.Name -in @('package.json','package-lock.json','index.html','eslint.config.js','vite.config.ts','playwright.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','.gitignore') } | ForEach-Object { Include-Fin05File $_ }
$fin05Files = @($fin05Files | Sort-Object Relative -Unique)
if (!$fin05Files.Count) { throw 'Không có mã nguồn để đóng gói.' }
$fin05SchemaPath = Join-Path $fin05Root 'deploy/FIN05-schema.sql'
if (!(Test-Path -LiteralPath $fin05SchemaPath)) { throw 'Thiếu deploy/FIN05-schema.sql. Sinh lại SQL idempotent từ migrations trước khi đóng gói.' }
$fin05Schema = [IO.File]::ReadAllText($fin05SchemaPath)
Get-ChildItem "$fin05Root/backend/Fin05.Api/Migrations" -File | Where-Object Name -Match '^\d{14}_.*(?<!\.Designer)\.cs$' | ForEach-Object {
    if (!$fin05Schema.Contains($_.BaseName,[StringComparison]::Ordinal)) { throw 'SQL cấu trúc đã cũ. Sinh lại từ migrations trước khi đóng gói.' }
}

# Defense in depth: compare actual local secret values in memory; report paths only, never the secret itself.
$fin05Secrets = [Collections.Generic.List[string]]::new()
foreach ($fin05SecretFile in @('dev-accounts.json','test-accounts.json','keycloak-admin.json')) {
    $fin05SecretPath = Join-Path $fin05Root ".local/$fin05SecretFile"
    if (!(Test-Path -LiteralPath $fin05SecretPath)) { continue }
    $fin05SecretData = Get-Content $fin05SecretPath -Raw | ConvertFrom-Json
    if ($fin05SecretData.bootstrapPassword) { $fin05Secrets.Add($fin05SecretData.bootstrapPassword) }
    if ($fin05SecretData.KeycloakAdmin.ClientSecret) { $fin05Secrets.Add($fin05SecretData.KeycloakAdmin.ClientSecret) }
    foreach ($fin05Account in $fin05SecretData.accounts) { if ($fin05Account.password) { $fin05Secrets.Add($fin05Account.password) } }
}
$fin05ManifestFiles = foreach ($fin05Entry in $fin05Files) {
    $fin05Bytes = [IO.File]::ReadAllBytes($fin05Entry.File.FullName)
    $fin05Text = [Text.Encoding]::UTF8.GetString($fin05Bytes)
    foreach ($fin05Secret in $fin05Secrets) {
        if ($fin05Secret.Length -ge 8 -and $fin05Text.Contains($fin05Secret,[StringComparison]::Ordinal)) { throw "Dừng đóng gói: phát hiện giá trị bí mật trong $($fin05Entry.Relative)." }
    }
    $fin05Entry | Add-Member -NotePropertyName Content -NotePropertyValue $fin05Bytes
    [ordered]@{ path=$fin05Entry.Relative; bytes=$fin05Bytes.Length; sha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($fin05Bytes)).ToLowerInvariant() }
}
$fin05Manifest = [ordered]@{ project='FIN-05'; createdAtUtc=[DateTime]::UtcNow.ToString('O'); kind='Source only; no private credentials or business data'; files=@($fin05ManifestFiles) } | ConvertTo-Json -Depth 6
New-Item -ItemType Directory -Force $fin05Output | Out-Null
$fin05Name = 'FIN05-source-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.zip'
$fin05ZipPath = Join-Path $fin05Output $fin05Name
$fin05Stream = [IO.File]::Open($fin05ZipPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {
    $fin05Archive = [IO.Compression.ZipArchive]::new($fin05Stream,[IO.Compression.ZipArchiveMode]::Create,$true)
    try {
        foreach ($fin05Entry in $fin05Files) {
            $fin05ZipEntry = $fin05Archive.CreateEntry('FIN05/'+$fin05Entry.Relative,[IO.Compression.CompressionLevel]::Optimal)
            $fin05EntryStream = $fin05ZipEntry.Open()
            try { $fin05EntryStream.Write($fin05Entry.Content,0,$fin05Entry.Content.Length) } finally { $fin05EntryStream.Dispose() }
        }
        $fin05ManifestEntry = $fin05Archive.CreateEntry('FIN05/HANDOFF-MANIFEST.json')
        $fin05Writer = [IO.StreamWriter]::new($fin05ManifestEntry.Open(),[Text.UTF8Encoding]::new($false))
        try { $fin05Writer.Write($fin05Manifest) } finally { $fin05Writer.Dispose() }
    } finally { $fin05Archive.Dispose() }
} finally { $fin05Stream.Dispose() }
$fin05Hash = (Get-FileHash -LiteralPath $fin05ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($fin05ZipPath+'.sha256',"$fin05Hash  $fin05Name`n",[Text.UTF8Encoding]::new($false))
Write-Host "Đã đóng gói $($fin05Files.Count) tệp mã nguồn: $fin05ZipPath"
Write-Host "SHA256: $fin05Hash"
Write-Host 'Không bao gồm .local, tools, mật khẩu, dữ liệu SQL/Keycloak, node_modules hoặc kết quả build/test.'
