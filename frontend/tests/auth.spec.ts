import { test, expect } from '@playwright/test'
import { login, accounts } from './fixtures'

test('API từ chối yêu cầu chưa đăng nhập và token giả', async ({ request }) => {
  expect((await request.get('/api/customers')).status()).toBe(401)
  expect((await request.get('/api/me')).status()).toBe(401)
  expect((await request.get('/api/customers', { headers: { Authorization: 'Bearer invalid-token' } })).status()).toBe(401)
})

test('Ban quản lý được xem nhưng bị chặn ghi ở giao diện và API', async ({ browser, playwright }) => {
  const context = await browser.newContext()
  try {
    const { page, token } = await login(context, accounts.find(account => account.role === 'manager')!)
    await expect(page.getByText('Bạn có quyền xem khách hàng.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Thêm khách hàng', exact: true })).toHaveCount(0)
    const api = await playwright.request.newContext({ baseURL: 'http://localhost:5173', extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
    try {
      expect((await api.get('/api/customers')).status()).toBe(200)
      const me = await (await api.get('/api/me')).json()
      expect(me.roles).toContain('manager')
      expect(me.roles).not.toContain('sales')
      expect((await api.post('/api/customers', { data: { customerCode: 'SHOULD_NOT_BE_CREATED', customerName: 'Forbidden' } })).status()).toBe(403)
      expect((await api.put('/api/customers/9223372036854775807', { data: {} })).status()).toBe(403)
      expect((await api.patch('/api/customers/9223372036854775807/status', { data: {} })).status()).toBe(403)
      const parts = token.split('.')
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      parts[1] = Buffer.from(JSON.stringify({ ...claims, roles: ['admin'] })).toString('base64url')
      expect((await api.get('/api/customers', { headers: { Authorization: `Bearer ${parts.join('.')}` } })).status()).toBe(401)
    } finally { await api.dispose() }
    await page.screenshot({ path: 'test-results/manager-read-only.png', fullPage: true })
    await page.getByRole('button', { name: 'Tài khoản & mật khẩu' }).click()
    await expect(page.getByRole('heading', { name: 'Personal info', exact: true })).toBeVisible()
    await expect(page.getByText('Something went wrong', { exact: true })).not.toBeVisible()
  } finally { await context.close() }
})

test('OIDC PKCE, tài khoản, đăng xuất và không lưu token trong storage', async ({ browser }) => {
  const context = await browser.newContext()
  try {
    const { page, token, refreshToken, exchange } = await login(context, accounts.find(account => account.role === 'sales')!)
    expect(exchange.get('grant_type')).toBe('authorization_code')
    expect(exchange.get('code_verifier')?.length).toBeGreaterThanOrEqual(43)
    const storage = await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)])
    expect(storage.some(value => value.includes(token))).toBe(false)
    expect(page.url()).not.toContain('access_token=')
    const refreshedResponse = await context.request.post('http://localhost:8080/realms/fin05/protocol/openid-connect/token', {
      form: { grant_type: 'refresh_token', client_id: 'fin05-web', refresh_token: refreshToken },
    })
    expect(refreshedResponse.status()).toBe(200)
    const refreshed = await refreshedResponse.json()
    expect((await context.request.get('http://localhost:5068/api/me', { headers: { Authorization: `Bearer ${refreshed.access_token}` } })).status()).toBe(200)
    const accountResponse = page.waitForResponse(response => response.url().includes('/account/?userProfileMetadata=true'))
    await page.getByRole('button', { name: 'Tài khoản & mật khẩu' }).click()
    await page.waitForURL(/\/realms\/fin05\/account(?:[/?]|$)/)
    expect((await accountResponse).status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Personal info', exact: true })).toBeVisible()
    await expect(page.getByText('Something went wrong', { exact: true })).not.toBeVisible()
    await page.getByText('Account security', { exact: true }).click()
    await page.getByRole('link', { name: 'Signing in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Signing in', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Update', exact: true }).click()
    await expect(page.locator('#password-new')).toBeVisible()
    await expect(page.locator('#password-confirm')).toBeVisible()
    await page.screenshot({ path: 'test-results/password-update-form.png', fullPage: true })
    await page.goto('http://localhost:5173')
    await expect(page.getByRole('heading', { name: 'Khách hàng', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible()
    await page.screenshot({ path: 'test-results/login.png', fullPage: true })
  } finally { await context.close() }
})

test('Keycloak từ chối mật khẩu sai', async ({ browser }) => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto('http://localhost:5173')
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await page.locator('#username').fill(accounts.find(account => account.role === 'sales')!.username)
    await page.locator('#password').fill('Incorrect-password-for-test')
    await page.locator('#kc-login').click()
    await expect(page.getByText('Invalid username or password.', { exact: true })).toBeVisible()
    expect(new URL(page.url()).port).toBe('8080')
  } finally { await context.close() }
})

for (const role of ['admin', 'accountant', 'cashier']) {
  test(`Quyền truy cập khách hàng của vai trò ${role}`, async ({ browser }) => {
    const context = await browser.newContext()
    try {
      const { token, page } = await login(context, accounts.find(account => account.role === role)!)
      const headers = { Authorization: `Bearer ${token}` }
      expect((await context.request.get('http://localhost:5068/api/customers', { headers })).status()).toBe(200)
      const write = await context.request.post('http://localhost:5068/api/customers', { headers, data: {} })
      expect(write.status()).toBe(role === 'admin' ? 400 : 403)
      await expect(page.getByRole('button', { name: 'Thêm khách hàng', exact: true })).toHaveCount(role === 'admin' ? 1 : 0)
      await page.getByRole('button', { name: 'Tài khoản & mật khẩu' }).click()
      await expect(page.getByRole('heading', { name: 'Personal info', exact: true })).toBeVisible()
    } finally { await context.close() }
  })
}
