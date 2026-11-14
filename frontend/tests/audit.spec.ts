import { test, expect, accounts, login } from './fixtures'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const prefix = `AUD${Date.now()}`
const codes: string[] = []
function sql(command: string) {
  return execFileSync('sqlcmd.exe', ['-S', 'localhost', '-E', '-C', '-d', 'FIN05', '-b', '-h', '-1', '-W', '-Q', `SET NOCOUNT ON; ${command}`], { encoding: 'utf8' }).trim()
}
test.afterAll(() => {
  if (!codes.length) return
  if (!codes.every(code => /^[A-Z0-9]+$/.test(code))) throw new Error('Unsafe test codes')
  const list = codes.map(code => `'${code}'`).join(',')
  sql(`DELETE FROM dbo.AuditLogs WHERE EntityName=N'Customers' AND EntityId IN (SELECT CONVERT(nvarchar(64),CustomerId) FROM dbo.Customers WHERE CustomerCode IN (${list})); DELETE FROM dbo.Customers WHERE CustomerCode IN (${list});`)
})

test('Nhật ký đúng người, đủ thay đổi, không ghi thao tác thất bại hoặc không thay đổi', async ({ request, page }) => {
  const code = `${prefix}HISTORY`
  codes.push(code)
  const me = await (await request.get('/api/me')).json()
  expect(me.appUserId).toBeGreaterThan(0)
  const created = await request.post('/api/customers', { data: { customerCode: code, customerName: 'Trước cập nhật', userId: 999999 } })
  expect(created.status()).toBe(201)
  const original = await created.json()
  const path = `/api/customers/${original.customerId}`
  const updated = await request.put(path, { data: { ...original, customerName: 'Sau cập nhật', phone: '0901234567', userId: 999999 } })
  expect(updated.status()).toBe(200)
  const current = await updated.json()
  expect((await request.put(path, { data: current })).status()).toBe(200)
  expect((await request.put(path, { data: { ...original, customerName: 'Ghi đè cũ' } })).status()).toBe(409)
  expect((await request.post('/api/customers', { data: { customerCode: code, customerName: 'Trùng mã' } })).status()).toBe(409)
  const stopped = await request.patch(`${path}/status`, { data: { isActive: false, rowVersion: current.rowVersion } })
  expect(stopped.status()).toBe(200)
  const history = await (await request.get(`${path}/audit`)).json()
  expect(history.total).toBe(3)
  expect(history.items.map((entry: { action: string }) => entry.action)).toEqual(['Customer.Deactivate', 'Customer.Update', 'Customer.Create'])
  for (const entry of history.items) {
    expect(entry.userId).toBe(me.appUserId)
    expect(entry.actorName).toBe(me.name)
    expect(entry.description).not.toMatch(/access_token|refresh_token|password|rowVersion/i)
  }
  const change = JSON.parse(history.items[1].description)
  expect(change.Before.CustomerName).toBe('Trước cập nhật')
  expect(change.After.CustomerName).toBe('Sau cập nhật')
  expect((await request.get(`${path}/audit?page=0`)).status()).toBe(400)
  const paged = await (await request.get(`${path}/audit?page=2&pageSize=1`)).json()
  expect(paged.total).toBe(3)
  expect(paged.items[0].action).toBe('Customer.Update')
  expect((await request.delete(`${path}/audit`)).status()).toBe(405)
  await page.goto('/')
  await page.getByLabel('Tìm khách hàng').fill(code)
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click()
  await page.getByRole('button', { name: `Xem chi tiết ${code}` }).click()
  await page.getByRole('dialog', { name: 'Chi tiết khách hàng' }).getByRole('button', { name: 'Lịch sử thao tác', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Lịch sử thao tác', exact: true })
  await expect(modal.getByText('3 thao tác', { exact: true })).toBeVisible()
  await expect(modal.getByText(`Người thực hiện: ${me.name}`)).toHaveCount(3)
  await modal.locator('details').nth(1).getByText('Xem thay đổi', { exact: true }).click()
  await expect(modal.locator('details').nth(1)).toContainText('Trước cập nhật')
  await expect(modal.locator('details').nth(1)).toContainText('Sau cập nhật')
  await page.screenshot({ path: 'test-results/customer-history.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/customer-history-mobile.png', fullPage: true })
  await page.keyboard.press('Escape')
  await expect(modal).not.toBeVisible()
})

test('Lỗi ghi nhật ký hoàn tác cả thêm và sửa khách hàng', async ({ request }) => {
  const code = `${prefix}ROLLBACK`
  const failedCode = `${prefix}FAIL`
  codes.push(code, failedCode)
  const customer = await (await request.post('/api/customers', { data: { customerCode: code, customerName: 'Giữ nguyên nếu lỗi' } })).json()
  const constraint = `CK_AuditFailure_${prefix}`
  sql(`ALTER TABLE dbo.AuditLogs ADD CONSTRAINT ${constraint} CHECK (Description NOT LIKE N'%${failedCode}%');`)
  try {
    const failedCreate = await request.post('/api/customers', { data: { customerCode: failedCode, customerName: 'Không được lưu' } })
    expect(failedCreate.status()).toBe(500)
    expect((await (await request.get(`/api/customers?search=${failedCode}`)).json()).total).toBe(0)
    const failedUpdate = await request.put(`/api/customers/${customer.customerId}`, { data: { ...customer, customerName: failedCode } })
    expect(failedUpdate.status()).toBe(500)
    const stored = await (await request.get(`/api/customers/${customer.customerId}`)).json()
    expect(stored.customerName).toBe(customer.customerName)
    expect(stored.rowVersion).toBe(customer.rowVersion)
    expect((await (await request.get(`/api/customers/${customer.customerId}/audit`)).json()).total).toBe(1)
  } finally { sql(`ALTER TABLE dbo.AuditLogs DROP CONSTRAINT ${constraint};`) }
})

test('Tài khoản chỉ xem không được đọc nhật ký chi tiết', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try {
    const { page, token } = await login(context, accounts.find(account => account.role === 'manager')!)
    expect((await context.request.get('http://localhost:5068/api/customers/9223372036854775807/audit', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(403)
    await expect(page.getByRole('button', { name: 'Lịch sử thao tác', exact: true })).toHaveCount(0)
  } finally { await context.close() }
})

test('Đồng bộ người dùng đồng thời, cập nhật hồ sơ và không tự mở khóa người dùng nội bộ', async ({ browser, playwright }) => {
  const secrets = JSON.parse(readFileSync(new URL('../../.local/dev-accounts.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''))
  const adminTokenResponse = await playwright.request.newContext()
  const adminToken = await (await adminTokenResponse.post('http://localhost:8080/realms/master/protocol/openid-connect/token', {
    form: { client_id: 'admin-cli', grant_type: 'password', username: secrets.bootstrapAdmin, password: secrets.bootstrapPassword },
  })).json()
  await adminTokenResponse.dispose()
  const admin = await playwright.request.newContext({ baseURL: 'http://localhost:8080/admin/realms/fin05', extraHTTPHeaders: { Authorization: `Bearer ${adminToken.access_token}` } })
  const username = `${prefix.toLowerCase()}sync`
  const password = `${prefix}-OnlyTest-2026!`
  let subject = ''
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try {
    const created = await admin.post('./fin05/users', { data: {
      username, enabled: true, firstName: 'Người dùng', lastName: 'Kiểm thử', email: `${username}@example.com`, emailVerified: true,
      credentials: [{ type: 'password', value: password, temporary: false }],
    } })
    expect(created.status()).toBe(201)
    subject = created.headers().location.split('/').pop()!
    expect(subject).toMatch(/^[a-f0-9-]{36}$/i)
    const role = await (await admin.get('./fin05/roles/manager')).json()
    expect((await admin.post(`./fin05/users/${subject}/role-mappings/realm`, { data: [role] })).status()).toBe(204)
    // Capture the token before any API request reaches FIN05, so the following calls really race on first registration.
    await context.route('**/api/**', route => route.abort())
    const { token, refreshToken } = await login(context, { username, password, role: 'manager' })
    const api = await playwright.request.newContext({ baseURL: 'http://localhost:5068', extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
    try {
      const responses = await Promise.all(Array.from({ length: 8 }, () => api.get('/api/me')))
      expect(responses.map(response => response.status())).toEqual(Array(8).fill(200))
      const results = await Promise.all(responses.map(response => response.json()))
      expect(new Set(results.map(result => result.appUserId)).size).toBe(1)
      expect(sql(`SELECT COUNT(*) FROM dbo.AppUsers WHERE KeycloakSubject='${subject}';`)).toBe('1')
      expect((await admin.put(`./fin05/users/${subject}`, { data: { firstName: 'Hồ sơ mới', lastName: 'Kiểm thử', email: `${username}.new@example.com` } })).status()).toBe(204)
      const fresh = await (await api.post('http://localhost:8080/realms/fin05/protocol/openid-connect/token', { form: { grant_type: 'refresh_token', client_id: 'fin05-web', refresh_token: refreshToken } })).json()
      const headers = { Authorization: `Bearer ${fresh.access_token}` }
      expect((await api.get('/api/me', { headers })).status()).toBe(200)
      expect(sql(`SELECT Email FROM dbo.AppUsers WHERE KeycloakSubject='${subject}';`)).toBe(`${username}.new@example.com`)
      sql(`UPDATE dbo.AppUsers SET IsActive=0 WHERE KeycloakSubject='${subject}';`)
      expect((await api.get('/api/customers', { headers })).status()).toBe(403)
      expect((await api.get('/api/me', { headers })).status()).toBe(403)
      expect(sql(`SELECT CONVERT(int,IsActive) FROM dbo.AppUsers WHERE KeycloakSubject='${subject}';`)).toBe('0')
    } finally { await api.dispose() }
  } finally {
    await context.close()
    if (/^[a-f0-9-]{36}$/i.test(subject)) {
      sql(`DELETE FROM dbo.AppUsers WHERE KeycloakSubject='${subject}';`)
      await admin.delete(`./fin05/users/${subject}`)
    }
    await admin.dispose()
  }
})
