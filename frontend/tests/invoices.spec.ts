import { test, expect, accounts, login } from './fixtures'
import { request as apiRequest } from '@playwright/test'
import type { Browser, APIRequestContext } from '@playwright/test'
import { execFileSync } from 'node:child_process'

const prefix = `INV${Date.now()}`
const customerCodes: string[] = []
function sql(command: string) {
  return execFileSync('sqlcmd.exe', ['-S','localhost','-E','-C','-d','FIN05','-I','-b','-h','-1','-W','-Q', `SET NOCOUNT ON; SET ANSI_NULLS ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF; ${command}`], { encoding: 'utf8' }).trim()
}
test.afterAll(() => {
  if (!customerCodes.length) return
  if (!customerCodes.every(code => /^[A-Z0-9]+$/.test(code))) throw new Error('Unsafe fixture code')
  const codes = customerCodes.map(code => `'${code}'`).join(',')
  const customers = `SELECT CustomerId FROM dbo.Customers WHERE CustomerCode IN (${codes})`
  sql(`DELETE FROM dbo.AuditLogs WHERE EntityName=N'Invoices' AND EntityId IN (SELECT CONVERT(nvarchar(64),InvoiceId) FROM dbo.Invoices WHERE CustomerId IN (${customers})); DELETE FROM dbo.Invoices WHERE CustomerId IN (${customers}); DELETE FROM dbo.AuditLogs WHERE EntityName=N'Customers' AND EntityId IN (SELECT CONVERT(nvarchar(64),CustomerId) FROM dbo.Customers WHERE CustomerCode IN (${codes})); DELETE FROM dbo.Customers WHERE CustomerCode IN (${codes});`)
})
async function createCustomer(api: APIRequestContext, suffix: string) {
  const code = prefix + suffix
  customerCodes.push(code)
  const response = await api.post('/api/customers', { data: { customerCode: code, customerName: `Khách hóa đơn ${suffix}` } })
  expect(response.status()).toBe(201)
  return response.json()
}
async function asRole(browser: Browser, role = 'accountant') {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const { page, token } = await login(context, accounts.find(account => account.role === role)!)
  const api = await apiRequest.newContext({ baseURL: 'http://localhost:5173', extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
  return { page, api, close: async () => { await api.dispose(); await context.close() } }
}
function draft(customerId: number) {
  return { customerId, invoiceDate: '2026-11-13', dueDate: '2026-11-20', items: [
    { description: 'Dịch vụ A', quantity: '0.005', unitPrice: '1.00' },
    { description: 'Dịch vụ B', quantity: '0.005', unitPrice: '1.00' },
  ] }
}

test('Hóa đơn tính tiền tại máy chủ, sửa dòng, chặn phiên bản cũ và hủy nháp', async ({ request, browser }) => {
  const customer = await createCustomer(request, 'MONEY')
  const actor = await asRole(browser)
  try {
    const me = await (await actor.api.get('/api/me')).json()
    const result = await actor.api.post('/api/invoices', { data: { ...draft(customer.customerId), totalAmount: '999', issueStatus: 'Issued', createdByUserId: 999999 } })
    expect(result.status()).toBe(201)
    const original = await result.json()
    expect(original.totalAmount).toBe('0.02')
    expect(original.items.map((line: { lineAmount: string }) => line.lineAmount)).toEqual(['0.01','0.01'])
    expect(original.createdByUserId).toBe(me.appUserId)
    expect(original.issueStatus).toBe('Draft')
    expect(original.invoiceNumber).toBeNull()
    const path = `/api/invoices/${original.invoiceId}`
    const changed = await actor.api.put(path, { data: { ...draft(customer.customerId), rowVersion: original.rowVersion, items: [{ description: 'Đổi nội dung, giữ tổng', quantity: '1', unitPrice: '0.02' }] } })
    expect(changed.status()).toBe(200)
    const current = await changed.json()
    expect(current.totalAmount).toBe('0.02')
    expect(current.items).toHaveLength(1)
    expect(current.rowVersion).not.toBe(original.rowVersion)
    expect((await actor.api.put(path, { data: { ...draft(customer.customerId), rowVersion: original.rowVersion } })).status()).toBe(409)
    expect((await actor.api.post(`${path}/cancel`, { data: { rowVersion: original.rowVersion } })).status()).toBe(409)
    const cancelled = await actor.api.post(`${path}/cancel`, { data: { rowVersion: current.rowVersion } })
    expect(cancelled.status()).toBe(200)
    const after = await cancelled.json()
    expect(after.issueStatus).toBe('Cancelled')
    expect(after.items).toHaveLength(1)
    expect((await actor.api.put(path, { data: { ...draft(customer.customerId), rowVersion: after.rowVersion } })).status()).toBe(409)
    expect((await actor.api.post(`${path}/cancel`, { data: { rowVersion: after.rowVersion } })).status()).toBe(409)
    expect(sql(`SELECT COUNT(*) FROM dbo.AuditLogs WHERE EntityName=N'Invoices' AND EntityId='${original.invoiceId}';`)).toBe('3')
    const empty = await actor.api.post('/api/invoices', { data: { ...draft(customer.customerId), items: [] } })
    expect(empty.status()).toBe(201)
    expect((await empty.json()).totalAmount).toBe('0.00')
    const large = await actor.api.post('/api/invoices', { data: { ...draft(customer.customerId), items: [{ description: 'Giá trị lớn chính xác', quantity: '9007199.255', unitPrice: '1000000000' }] } })
    expect(large.status()).toBe(201)
    expect((await large.json()).totalAmount).toBe('9007199255000000.00')
  } finally { await actor.close() }
})

test('Kiểm tra ngày, độ chính xác tiền, dòng chi tiết và khách hàng ngừng hoạt động', async ({ request, browser }) => {
  const customer = await createCustomer(request, 'VALIDATE')
  const actor = await asRole(browser)
  try {
    const base = draft(customer.customerId)
    for (const body of [
      { ...base, dueDate: '2026-11-12' }, { ...base, customerId: 922337203685477 },
      { ...base, items: null }, { ...base, items: [null] },
      { ...base, items: [{ description: '', quantity: '1', unitPrice: '1' }] },
      { ...base, items: [{ description: 'Sai', quantity: '0', unitPrice: '1' }] },
      { ...base, items: [{ description: 'Sai', quantity: '0.0001', unitPrice: '1' }] },
      { ...base, items: [{ description: 'Sai', quantity: '1', unitPrice: '1.001' }] },
      { ...base, items: [{ description: 'Vượt tổng', quantity: '999999999', unitPrice: '999999999999' }] },
      { ...base, items: Array.from({length:201}, () => ({ description:'Quá nhiều dòng',quantity:'1',unitPrice:'1' })) },
    ]) expect((await actor.api.post('/api/invoices', { data: body })).status()).toBe(400)
    expect((await request.patch(`/api/customers/${customer.customerId}/status`, { data: { isActive:false, rowVersion:customer.rowVersion } })).status()).toBe(200)
    expect((await actor.api.post('/api/invoices', { data: base })).status()).toBe(400)
    expect((await actor.api.get('/api/invoices?status=INVALID')).status()).toBe(400)
    expect((await actor.api.get('/api/invoices?page=0')).status()).toBe(400)
    expect((await actor.api.get('/api/invoices/9223372036854775807')).status()).toBe(404)
  } finally { await actor.close() }
})

test('Giao diện lập, tải lại, sửa và hủy hóa đơn nháp', async ({ request, browser }) => {
  const customer = await createCustomer(request, 'UI')
  const actor = await asRole(browser)
  const { page } = actor
  try {
    await page.getByRole('link', { name: 'Hóa đơn', exact: true }).click()
    await page.getByRole('button', { name: 'Lập hóa đơn', exact: false }).click()
    const editor = page.getByRole('dialog', { name: 'Lập hóa đơn nháp', exact: true })
    await editor.getByLabel('Tìm khách hàng đang hoạt động').fill(customer.customerCode)
    await expect(editor.locator('#invoice-customer option')).toHaveCount(2)
    await editor.locator('#invoice-customer').selectOption(String(customer.customerId))
    await editor.getByRole('button', { name: 'Thêm dòng', exact: false }).click()
    await editor.getByLabel('Nội dung dòng 1').fill('Dịch vụ triển khai')
    await editor.getByLabel('Số lượng dòng 1').fill('1.005')
    await editor.getByLabel('Đơn giá dòng 1').fill('1')
    await editor.getByRole('button', { name: 'Thêm dòng', exact: false }).click()
    await editor.getByLabel('Nội dung dòng 2').fill('Dịch vụ bảo trì')
    await editor.getByLabel('Số lượng dòng 2').fill('2')
    await editor.getByLabel('Đơn giá dòng 2').fill('1000')
    await expect(editor.locator('.invoice-total')).toContainText('2.001,01')
    await page.screenshot({ path:'test-results/invoice-editor.png', fullPage:true })
    await editor.getByRole('button', { name:'Lưu nháp',exact:true }).click()
    await expect(editor).not.toBeVisible()
    const details = page.getByRole('dialog', { name:/Hóa đơn #/ })
    await expect(details.locator('.invoice-total')).toContainText('2.001,01')
    const id = (await details.getByRole('heading', { level: 2 }).innerText()).split('#')[1]
    await details.getByRole('button', { name:'Đóng',exact:true }).click()
    await page.reload()
    await page.getByLabel('Tìm hóa đơn').fill(id)
    await page.getByRole('button', { name:'Tìm kiếm',exact:true }).click()
    await page.getByRole('button', { name:`Xem hóa đơn ${id}` }).click()
    await details.getByRole('button', { name:'Chỉnh sửa nháp',exact:true }).click()
    const edit = page.getByRole('dialog', { name:'Chỉnh sửa hóa đơn nháp',exact:true })
    await edit.getByRole('button', { name:'Xóa dòng 1',exact:true }).click()
    await edit.getByRole('button', { name:'Lưu nháp',exact:true }).click()
    await expect(edit).not.toBeVisible()
    await expect(details.locator('.invoice-total')).toContainText('2.000,00')
    await page.screenshot({ path:'test-results/invoice-details.png',fullPage:true })
    await details.getByRole('button', { name:'Hủy bản nháp',exact:true }).click()
    await details.getByRole('button', { name:'Giữ bản nháp',exact:true }).click()
    await expect(details.getByRole('button', { name:'Chỉnh sửa nháp',exact:true })).toBeVisible()
    await details.getByRole('button', { name:'Hủy bản nháp',exact:true }).click()
    await details.getByRole('button', { name:'Xác nhận hủy nháp',exact:true }).click()
    await expect(details.getByText('Hủy nháp', { exact:true })).toBeVisible()
    await expect(details.getByRole('button', { name:'Chỉnh sửa nháp',exact:true })).toHaveCount(0)
    await details.getByRole('button', { name:'Đóng',exact:true }).click()
    await page.setViewportSize({width:390,height:844})
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({path:'test-results/invoices-mobile.png',fullPage:true})
    await page.getByRole('button', { name: 'Lập hóa đơn', exact: false }).click()
    await expect(editor.getByRole('button', { name: 'Lưu nháp', exact: true })).toBeInViewport()
    await page.screenshot({path:'test-results/invoice-editor-mobile.png',fullPage:true})
  } finally { await actor.close() }
})

test('Hoàn tác hóa đơn và chi tiết khi ghi nhật ký lỗi', async ({ request, browser }) => {
  const customer = await createCustomer(request, 'ATOMIC')
  const actor = await asRole(browser)
  const marker = `${prefix}FAIL`
  const constraint = `CK_InvoiceAudit_${prefix}`
  try {
    const baseline = await (await actor.api.post('/api/invoices', { data:draft(customer.customerId) })).json()
    sql(`ALTER TABLE dbo.AuditLogs ADD CONSTRAINT ${constraint} CHECK (EntityName <> N'Invoices' OR ((Action=N'Invoice.CreateDraft' OR ISNULL(EntityId,'') <> '${baseline.invoiceId}') AND ISNULL(Description,'') NOT LIKE N'%${marker}%'));`)
    try {
      const failed = await actor.api.post('/api/invoices', { data:{...draft(customer.customerId),items:[{description:marker,quantity:'1',unitPrice:'1'}]} })
      expect(failed.status()).toBe(500)
      const updated = await actor.api.put(`/api/invoices/${baseline.invoiceId}`, { data:{...draft(customer.customerId),rowVersion:baseline.rowVersion,items:[{description:'Bị hoàn tác',quantity:'1',unitPrice:'99'}]} })
      expect(updated.status()).toBe(500)
      expect((await actor.api.post(`/api/invoices/${baseline.invoiceId}/cancel`, {data:{rowVersion:baseline.rowVersion}})).status()).toBe(500)
      const stored = await (await actor.api.get(`/api/invoices/${baseline.invoiceId}`)).json()
      expect(stored.items).toEqual(baseline.items)
      expect(stored.totalAmount).toBe(baseline.totalAmount)
      expect(stored.rowVersion).toBe(baseline.rowVersion)
      expect(stored.issueStatus).toBe('Draft')
      expect((await (await actor.api.get(`/api/invoices?search=${customer.customerCode}`)).json()).total).toBe(1)
    } finally { sql(`ALTER TABLE dbo.AuditLogs DROP CONSTRAINT ${constraint};`) }
  } finally { await actor.close() }
})

test('Quyền hóa đơn và khóa hóa đơn đã phát hành', async ({ request, browser }) => {
  const customer = await createCustomer(request, 'ROLES')
  expect((await request.get('/api/invoices')).status()).toBe(403)
  const accountant = await asRole(browser)
  try {
    const invoice = await (await accountant.api.post('/api/invoices', {data:draft(customer.customerId)})).json()
    sql(`UPDATE dbo.Invoices SET IssueStatus='Issued',InvoiceNumber='TEST${invoice.invoiceId}',IssuedAt=SYSUTCDATETIME() WHERE InvoiceId=${invoice.invoiceId};`)
    const issued = await (await accountant.api.get(`/api/invoices/${invoice.invoiceId}`)).json()
    expect((await accountant.api.put(`/api/invoices/${invoice.invoiceId}`,{data:{...draft(customer.customerId),rowVersion:issued.rowVersion}})).status()).toBe(409)
    expect((await accountant.api.post(`/api/invoices/${invoice.invoiceId}/cancel`,{data:{rowVersion:issued.rowVersion}})).status()).toBe(409)
    const manager = await asRole(browser,'manager')
    try {
      expect((await manager.api.get('/api/invoices')).status()).toBe(200)
      expect((await manager.api.post('/api/invoices',{data:draft(customer.customerId)})).status()).toBe(403)
      await manager.page.getByRole('link',{name:'Hóa đơn',exact:true}).click()
      await expect(manager.page.getByRole('heading',{name:'Hóa đơn',exact:true})).toBeVisible()
      await expect(manager.page.getByRole('button',{name:/Lập hóa đơn/})).toHaveCount(0)
    } finally {await manager.close()}
  } finally {await accountant.close()}
})

test('Hai cửa sổ sửa cùng bản nháp chỉ một thay đổi được lưu', async ({ request, browser }) => {
  const customer = await createCustomer(request, 'RACE')
  const actor = await asRole(browser)
  try {
    const original = await (await actor.api.post('/api/invoices', { data: draft(customer.customerId) })).json()
    const path = `/api/invoices/${original.invoiceId}`
    const results = await Promise.all(['Cửa sổ A', 'Cửa sổ B'].map(description => actor.api.put(path, {
      data: { ...draft(customer.customerId), rowVersion: original.rowVersion, items: [{description,quantity:'2',unitPrice:'1'}] },
    })))
    expect(results.map(result => result.status()).sort()).toEqual([200,409])
    const saved = await (await actor.api.get(path)).json()
    expect(saved.items).toHaveLength(1)
    expect(['Cửa sổ A','Cửa sổ B']).toContain(saved.items[0].description)
    expect(saved.totalAmount).toBe('2.00')
    expect(sql(`SELECT COUNT(*) FROM dbo.AuditLogs WHERE EntityName=N'Invoices' AND EntityId='${saved.invoiceId}';`)).toBe('2')
  } finally { await actor.close() }
})
