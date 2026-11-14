import { test, expect, login, accounts } from './fixtures'
import { money } from '../src/invoices'
import Decimal from 'decimal.js'

test('Bàn làm việc đối chiếu số dư thật và mở đúng bộ lọc quá hạn', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try {
    const { page, token } = await login(context, accounts.find(account => account.role === 'admin')!)
    const response = await context.request.get('http://localhost:5173/api/reports?type=Receivables&pageSize=1', { headers: { Authorization: `Bearer ${token}` } })
    expect(response.ok()).toBeTruthy()
    const report = await response.json()
    await page.getByRole('link', { name: 'Bàn làm việc', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Bàn làm việc', exact: true })).toBeVisible()
    const summary = page.getByRole('region', { name: 'Tổng hợp nghiệp vụ' })
    await expect(summary.locator('.main-stat strong')).toHaveText(money(report.summary.remainingAmount))
    await expect(summary.locator('.risk-stat strong')).toHaveText(money(report.summary.overdueAmount))
    const bridge = page.getByRole('region', { name: 'Đối chiếu công nợ', exact: true })
    for (const [index, field] of ['originalAmount', 'adjustmentAmount', 'allocatedAmount', 'remainingAmount'].entries()) {
      await expect(bridge.locator('.bridge-step strong').nth(index)).toHaveText(money(report.summary[field]))
    }
    const adjusted = new Decimal(report.summary.originalAmount).plus(report.summary.adjustmentAmount)
    const percentage = adjusted.greaterThan(0) ? new Decimal(report.summary.allocatedAmount).div(adjusted).times(100).toFixed(1).replace('.', ',') : null
    await expect(bridge.locator('.bridge-recovery-text strong')).toHaveText(percentage === null ? 'Chưa có giá trị phải thu sau điều chỉnh' : `${percentage}% giá trị phải thu đã được phân bổ`)
    await page.getByRole('link', { name: 'Xem toàn bộ' }).click()
    await expect(page.getByLabel('Lọc công nợ quá hạn')).toHaveValue('true')
  } finally { await context.close() }
})

for (const role of ['sales', 'cashier']) {
  test(`Bàn làm việc ${role} không gọi dữ liệu tài chính ngoài quyền và dùng được trên điện thoại`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } })
    try {
      const { page } = await login(context, accounts.find(account => account.role === role)!)
      const forbidden: string[] = []
      page.on('request', request => { if (/\/api\/(reports|receivables|invoices)/.test(request.url())) forbidden.push(request.url()) })
      await page.goto('/overview')
      await expect(page.getByRole('heading', { name: 'Bàn làm việc', exact: true })).toBeVisible()
      await expect(page.locator('.ledger-stats .main-stat strong')).not.toHaveText('—')
      expect(forbidden).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
      await page.getByRole('link', { name: role === 'sales' ? 'Khách hàng' : 'Phiếu thu', exact: true }).click()
      await expect(page.getByRole('heading', { name: role === 'sales' ? 'Khách hàng' : 'Phiếu thu', exact: true })).toBeVisible()
    } finally { await context.close() }
  })
}
