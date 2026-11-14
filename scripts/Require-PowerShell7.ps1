function Use-Fin05PowerShell7 {
    param([string]$ScriptPath, [hashtable]$ScriptParameters)
    if ($PSVersionTable.PSVersion.Major -ge 7) { return }
    $fin05Shell = Get-Command pwsh.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
    if (!$fin05Shell -and (Test-Path -LiteralPath "$env:ProgramFiles/PowerShell/7/pwsh.exe")) { $fin05Shell = "$env:ProgramFiles/PowerShell/7/pwsh.exe" }
    if (!$fin05Shell) { $fin05Shell = Get-ChildItem "$env:ProgramFiles/WindowsApps/OpenAI.CodexPrimaryRuntime.*/dependencies/native/powershell/pwsh.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName }
    if (!$fin05Shell) { throw 'Cần PowerShell 7. Hãy cài PowerShell 7 rồi chạy lại lệnh.' }
    & $fin05Shell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @ScriptParameters
    exit $LASTEXITCODE
}
