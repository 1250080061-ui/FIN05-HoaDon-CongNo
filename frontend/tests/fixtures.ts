import { test as base, expect } from '@playwright/test'
import type { BrowserContext, Browser, APIRequestContext } from '@playwright/test'
import { readFileSync } from 'node:fs'

type Account = { username: string; password: string; role: string }
export const accounts = (JSON.parse(readFileSync(new URL('../../.local/test-accounts.json', import.meta.url), 'utf8').replace(/^\uFEFF/, '')) as { accounts: Account[] }).accounts
export async function login(context: BrowserContext, account: Account) {
  const page = await context.newPage()
  await page.goto('http://localhost:5173')
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.locator('#username').fill(account.username)
  await page.locator('#password').fill(account.password)
  const tokenResponse = page.waitForResponse(response => response.url().includes('/protocol/openid-connect/token') && response.request().method() === 'POST')
  await page.locator('#kc-login').click()
  const tokenHttpResponse = await tokenResponse
  const result = await tokenHttpResponse.json()
  await expect(page.getByRole('heading', { name: 'Khách hàng', exact: true })).toBeVisible()
  return { page, token: result.access_token as string, refreshToken: result.refresh_token as string, exchange: new URLSearchParams(tokenHttpResponse.request().postData() ?? '') }
}
type Auth = { token: string; state: Awaited<ReturnType<BrowserContext['storageState']>> }
export const test = base.extend<{ request: APIRequestContext }, { session: Auth }>({
  session: [async ({ browser }: { browser: Browser }, use: (session: Auth) => Promise<void>) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const { token } = await login(context, accounts.find(account => account.role === 'sales')!)
    await use({ token, state: await context.storageState() })
    await context.close()
  }, { scope: 'worker' }],
  storageState: async ({ session }, provide) => { await provide(session.state) },
  request: async ({ playwright, session }, provide) => {
    const request = await playwright.request.newContext({ baseURL: 'http://localhost:5173', extraHTTPHeaders: { Authorization: `Bearer ${session.token}` } })
    await provide(request)
    await request.dispose()
  },
})
export { expect }
