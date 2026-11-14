param([string]$BaseUrl = 'http://localhost:5068', [string]$AccessToken = $env:FIN05_TEST_ACCESS_TOKEN)
$ErrorActionPreference = 'Stop'
if (!$AccessToken) { throw 'Cần token Keycloak; chạy npm.cmd run test:e2e trong frontend để kiểm tra cả đăng nhập và API.' }
$testSuffix = [guid]::NewGuid().ToString('N').Substring(0, 16).ToUpperInvariant()
$testCode = 'TEST_' + $testSuffix
$raceCode = 'RACE_' + $testSuffix
$passed = 0
function Check([bool]$Condition, [string]$Description) {
    if (!$Condition) { throw "FAIL: $Description" }
    $script:passed++
    Write-Output "PASS: $Description"
}
function Send([string]$Method, [string]$Path, $Body = $null) {
    $parameters = @{ Uri = "$BaseUrl$Path"; Method = $Method; SkipHttpErrorCheck = $true; Headers = @{ Authorization = "Bearer $AccessToken" } }
    if ($null -ne $Body) {
        $parameters.ContentType = 'application/json; charset=utf-8'
        $parameters.Body = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress))
    }
    Invoke-WebRequest @parameters
}
try {
    $created = Send POST '/api/customers' @{
        customerCode = " $($testCode.ToLowerInvariant()) "
        customerName = ' Công ty kiểm thử tiếng Việt '
        email = 'qa@example.com'
        phone = '0901234567'
        address = 'TP. Hồ Chí Minh'
    }
    Check ($created.StatusCode -eq 201) 'Create returns 201'
    $customer = $created.Content | ConvertFrom-Json
    Check ($customer.customerCode -eq $testCode -and $customer.customerName -ceq 'Công ty kiểm thử tiếng Việt') 'Trim, code normalization and Unicode preserved'
    Check ($customer.isActive -eq $true -and $null -ne $created.Headers.Location) 'Active default and Location header'
    $detail = Send GET "/api/customers/$($customer.customerId)"
    Check ($detail.StatusCode -eq 200 -and ($detail.Content | ConvertFrom-Json).email -eq 'qa@example.com') 'Read saved customer by id'
    $list = Send GET "/api/customers?search=$testCode&pageSize=1"
    $page = $list.Content | ConvertFrom-Json
    Check ($page.total -eq 1 -and @($page.items).Count -eq 1) 'Search and pagination return saved record'
    Check ((Send POST '/api/customers' @{customerCode=$testCode.ToLowerInvariant();customerName='Duplicate'}).StatusCode -eq 409) 'Duplicate code returns 409'
    Check ((Send POST '/api/customers' @{customerCode='  ';customerName='  '}).StatusCode -eq 400) 'Whitespace required fields rejected'
    Check ((Send POST '/api/customers' @{customerCode=('X'*31);customerName='Length'}).StatusCode -eq 400) 'Overlong code rejected'
    Check ((Send POST '/api/customers' @{customerCode='BAD_EMAIL';customerName='Email';email='invalid'}).StatusCode -eq 400) 'Invalid email rejected'
    Check ((Send POST '/api/customers' @{customerCode='BAD_PHONE';customerName='Phone';phone=('1'*21)}).StatusCode -eq 400) 'Overlong phone rejected'
    Check ((Send GET '/api/customers?page=0').StatusCode -eq 400) 'Invalid page rejected'
    Check ((Send GET '/api/customers?pageSize=101').StatusCode -eq 400) 'Oversized page rejected'
    Check ((Send GET '/api/customers/9223372036854775807').StatusCode -eq 404) 'Missing record returns 404'
    $http = [System.Net.Http.HttpClient]::new()
    $http.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $AccessToken)
    try {
        $json = @{customerCode=$raceCode;customerName='Concurrent test'} | ConvertTo-Json -Compress
        $body1 = [System.Net.Http.StringContent]::new($json, [System.Text.Encoding]::UTF8, 'application/json')
        $body2 = [System.Net.Http.StringContent]::new($json, [System.Text.Encoding]::UTF8, 'application/json')
        $task1 = $http.PostAsync("$BaseUrl/api/customers", $body1)
        $task2 = $http.PostAsync("$BaseUrl/api/customers", $body2)
        $response1 = $task1.GetAwaiter().GetResult()
        $response2 = $task2.GetAwaiter().GetResult()
        $codes = @([int]$response1.StatusCode, [int]$response2.StatusCode) | Sort-Object
        Check ($codes[0] -eq 201 -and $codes[1] -eq 409) 'Concurrent duplicate requests: one 201, one 409'
        $response1.Dispose(); $response2.Dispose(); $body1.Dispose(); $body2.Dispose()
    } finally { $http.Dispose() }
    # Independent SQL query verifies storage, rather than only the HTTP response.
    $sqlCount = & sqlcmd -S localhost -E -C -d FIN05 -h -1 -W -b -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM dbo.Customers WHERE CustomerCode IN ('$testCode', '$raceCode');"
    Check ($LASTEXITCODE -eq 0 -and ($sqlCount -join '').Trim() -eq '2') 'Both records persisted in SQL Server'
    Write-Output "Completed: $passed checks passed."
} finally {
    # Only remove records created by this run; never clear the Customers table.
    & sqlcmd -S localhost -E -C -d FIN05 -b -Q "DELETE FROM dbo.AuditLogs WHERE EntityName=N'Customers' AND EntityId IN (SELECT CONVERT(nvarchar(64),CustomerId) FROM dbo.Customers WHERE CustomerCode IN ('$testCode', '$raceCode')); DELETE FROM dbo.Customers WHERE CustomerCode IN ('$testCode', '$raceCode');" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Cleanup failed for $testCode and $raceCode" }
}
