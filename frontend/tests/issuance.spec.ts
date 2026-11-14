import { test, expect, login, accounts } from './fixtures'
import { request as apiRequest } from '@playwright/test'
import type { Browser, APIRequestContext } from '@playwright/test'
import { execFileSync } from 'node:child_process'

const prefix = `ISS${Date.now()}`
const customerCodes: string[] = []
function sql(command: string) {
  return execFileSync('sqlcmd.exe', ['-S','localhost','-E','-C','-d','FIN05','-I','-b','-h','-1','-W','-Q', `SET NOCOUNT ON; SET ANSI_NULLS ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF; ${command}`], { encoding:'utf8' }).trim()
}
test.afterAll(() => {
  if (!customerCodes.length) return
  if (!customerCodes.every(code => /^[A-Z0-9]+$/.test(code))) throw new Error('Unsafe test code')
  const codes = customerCodes.map(code => `'${code}'`).join(',')
  const customers = `SELECT CustomerId FROM dbo.Customers WHERE CustomerCode IN (${codes})`
  sql(`DELETE FROM dbo.AuditLogs WHERE EntityName=N'Invoices' AND EntityId IN (SELECT CONVERT(nvarchar(64),InvoiceId) FROM dbo.Invoices WHERE CustomerId IN (${customers})); DELETE FROM dbo.Invoices WHERE CustomerId IN (${customers}); DELETE FROM dbo.AuditLogs WHERE EntityName=N'Customers' AND EntityId IN (SELECT CONVERT(nvarchar(64),CustomerId) FROM dbo.Customers WHERE CustomerCode IN (${codes})); DELETE FROM dbo.Customers WHERE CustomerCode IN (${codes});`)
})
async function asRole(browser: Browser, role = 'accountant') {
  const context = await browser.newContext({ storageState:{cookies:[],origins:[]} })
  const {page,token} = await login(context,accounts.find(account => account.role === role)!)
  const api = await apiRequest.newContext({baseURL:'http://localhost:5173',extraHTTPHeaders:{Authorization:`Bearer ${token}`}})
  const asOfDate = role === 'accountant' || role === 'manager' ? (await (await api.get('/api/receivables')).json()).asOfDate as string : ''
  return {page,api,asOfDate,close:async()=>{await api.dispose();await context.close()}}
}
async function customer(api:APIRequestContext,suffix:string) {
  const code=prefix+suffix;customerCodes.push(code)
  const result=await api.post('/api/customers',{data:{customerCode:code,customerName:`Khách phát hành ${suffix}`}})
  expect(result.status()).toBe(201);return result.json()
}
function day(base:string,offset:number) {const date=new Date(`${base}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10)}
async function draft(api:APIRequestContext,customerId:number,today:string,dueOffset=0,amount='100.00') {
  const response=await api.post('/api/invoices',{data:{customerId,invoiceDate:day(today,-30),dueDate:day(today,dueOffset),items:[{description:'Dịch vụ mô phỏng',quantity:'1',unitPrice:amount}]}})
  expect(response.status()).toBe(201);return response.json()
}

test('Phát hành và tổng hợp công nợ: loại nháp/hủy, đúng ngày quá hạn, tổng theo bộ lọc',async({request,browser})=>{
  const c=await customer(request,'BALANCE');const actor=await asRole(browser)
  try {
    const yesterday=await draft(actor.api,c.customerId,actor.asOfDate,-1,'100.25')
    const today=await draft(actor.api,c.customerId,actor.asOfDate,0,'200.00')
    const tomorrow=await draft(actor.api,c.customerId,actor.asOfDate,1,'0.75')
    await draft(actor.api,c.customerId,actor.asOfDate,2,'50')
    const cancel=await draft(actor.api,c.customerId,actor.asOfDate,2,'60')
    expect((await actor.api.post(`/api/invoices/${cancel.invoiceId}/cancel`,{data:{rowVersion:cancel.rowVersion}})).status()).toBe(200)
    const query=`/api/receivables?customerId=${c.customerId}`
    expect((await(await actor.api.get(query)).json()).total).toBe(0)
    const issued=[]
    for(const invoice of [yesterday,today,tomorrow]) {
      const result=await actor.api.post(`/api/invoices/${invoice.invoiceId}/issue`,{data:{rowVersion:invoice.rowVersion,invoiceNumber:'FAKE',totalAmount:'1'}})
      expect(result.status()).toBe(200)
      const saved=await result.json();issued.push(saved)
      expect(saved.invoiceNumber).toBe(`SIM-${actor.asOfDate.slice(0,4)}-${String(invoice.invoiceId).padStart(10,'0')}`)
      expect(saved.issuedAt).toMatch(/Z$/)
      expect(saved.rowVersion).not.toBe(invoice.rowVersion)
      expect(saved.issueStatus).toBe('Issued')
    }
    expect(new Set(issued.map(invoice=>invoice.invoiceNumber)).size).toBe(3)
    const balance=await(await actor.api.get(query)).json()
    expect(balance.total).toBe(3)
    expect(balance.summary.remainingAmount).toBe('301.00')
    expect(balance.summary.overdueAmount).toBe('100.25')
    expect(balance.items.map((item:{isOverdue:boolean})=>item.isOverdue)).toEqual([true,false,false])
    expect(balance.items[0].overdueDays).toBe(1)
    expect(balance.items[1].overdueDays).toBe(0)
    expect(balance.items[0].paidAmount).toBe('0.00')
    expect(balance.items[0].remainingAmount).toBe('100.25')
    const overdue=await(await actor.api.get(`${query}&overdue=true`)).json()
    expect(overdue.total).toBe(1);expect(overdue.summary.remainingAmount).toBe('100.25')
    const current=await(await actor.api.get(`${query}&overdue=false`)).json()
    expect(current.total).toBe(2);expect(current.summary.remainingAmount).toBe('200.75')
    const paged=await(await actor.api.get(`${query}&page=2&pageSize=1`)).json()
    expect(paged.items[0].invoiceId).toBe(today.invoiceId)
    expect(paged.summary.remainingAmount).toBe('301.00')
    expect((await(await actor.api.get(`${query}&fromDueDate=${actor.asOfDate}&toDueDate=${actor.asOfDate}`)).json()).total).toBe(1)
    expect((await(await actor.api.get(`/api/receivables?search=${issued[0].invoiceNumber}`)).json()).total).toBe(1)
    expect((await actor.api.get(`${query}&fromDueDate=${day(actor.asOfDate,1)}&toDueDate=${day(actor.asOfDate,-1)}`)).status()).toBe(400)
    expect((await actor.api.get('/api/receivables?page=0')).status()).toBe(400)
    expect((await actor.api.get('/api/receivables?pageSize=101')).status()).toBe(400)
    expect((await request.patch(`/api/customers/${c.customerId}/status`,{data:{isActive:false,rowVersion:c.rowVersion}})).status()).toBe(200)
    expect((await(await actor.api.get(query)).json()).total).toBe(3)
  }finally{await actor.close()}
})

test('Chặn phát hành nháp rỗng, tiền bằng 0, khách hàng khóa, bản cũ và bản hủy',async({request,browser})=>{
  const c=await customer(request,'INVALID');const actor=await asRole(browser)
  try {
    const invoice=await draft(actor.api,c.customerId,actor.asOfDate)
    const empty=await(await actor.api.post('/api/invoices',{data:{customerId:c.customerId,invoiceDate:actor.asOfDate,dueDate:actor.asOfDate,items:[]}})).json()
    expect((await actor.api.post(`/api/invoices/${empty.invoiceId}/issue`,{data:{rowVersion:empty.rowVersion}})).status()).toBe(400)
    const zero=await draft(actor.api,c.customerId,actor.asOfDate,0,'0')
    expect((await actor.api.post(`/api/invoices/${zero.invoiceId}/issue`,{data:{rowVersion:zero.rowVersion}})).status()).toBe(400)
    expect((await actor.api.post(`/api/invoices/${invoice.invoiceId}/issue`,{data:{}})).status()).toBe(400)
    const changed=await(await actor.api.put(`/api/invoices/${invoice.invoiceId}`,{data:{customerId:c.customerId,invoiceDate:actor.asOfDate,dueDate:actor.asOfDate,rowVersion:invoice.rowVersion,items:[{description:'Mới',quantity:'1',unitPrice:'50'}]}})).json()
    expect((await actor.api.post(`/api/invoices/${invoice.invoiceId}/issue`,{data:{rowVersion:invoice.rowVersion}})).status()).toBe(409)
    expect((await actor.api.post(`/api/invoices/${invoice.invoiceId}/cancel`,{data:{rowVersion:changed.rowVersion}})).status()).toBe(200)
    const cancelled=await(await actor.api.get(`/api/invoices/${invoice.invoiceId}`)).json()
    expect((await actor.api.post(`/api/invoices/${invoice.invoiceId}/issue`,{data:{rowVersion:cancelled.rowVersion}})).status()).toBe(409)
    const locked=await draft(actor.api,c.customerId,actor.asOfDate)
    expect((await request.patch(`/api/customers/${c.customerId}/status`,{data:{isActive:false,rowVersion:c.rowVersion}})).status()).toBe(200)
    expect((await actor.api.post(`/api/invoices/${locked.invoiceId}/issue`,{data:{rowVersion:locked.rowVersion}})).status()).toBe(400)
    expect((await(await actor.api.get(`/api/receivables?customerId=${c.customerId}`)).json()).total).toBe(0)
  }finally{await actor.close()}
})

test('Hai yêu cầu phát hành chỉ cấp một số và một khoản phải thu',async({request,browser})=>{
  const c=await customer(request,'RACE');const actor=await asRole(browser)
  try {
    const invoice=await draft(actor.api,c.customerId,actor.asOfDate)
    const path=`/api/invoices/${invoice.invoiceId}`
    const results=await Promise.all([1,2].map(()=>actor.api.post(`${path}/issue`,{data:{rowVersion:invoice.rowVersion}})))
    expect(results.map(result=>result.status()).sort()).toEqual([200,409])
    const saved=await(await actor.api.get(path)).json()
    expect(saved.issueStatus).toBe('Issued')
    expect((await actor.api.post(`${path}/issue`,{data:{rowVersion:saved.rowVersion}})).status()).toBe(409)
    expect((await actor.api.post(`${path}/cancel`,{data:{rowVersion:saved.rowVersion}})).status()).toBe(409)
    const balance=await(await actor.api.get(`/api/receivables?customerId=${c.customerId}`)).json()
    expect(balance.total).toBe(1);expect(balance.summary.remainingAmount).toBe('100.00')
    expect(sql(`SELECT COUNT(*) FROM dbo.AuditLogs WHERE EntityName=N'Invoices' AND EntityId='${invoice.invoiceId}' AND Action=N'Invoice.Issue';`)).toBe('1')
    const me=await(await actor.api.get('/api/me')).json()
    expect(sql(`SELECT UserId FROM dbo.AuditLogs WHERE EntityName=N'Invoices' AND EntityId='${invoice.invoiceId}' AND Action=N'Invoice.Issue';`)).toBe(String(me.appUserId))
  }finally{await actor.close()}
})

test('Ghi nhật ký lỗi hoàn tác số hóa đơn, thời gian phát hành và công nợ',async({request,browser})=>{
  const c=await customer(request,'ATOMIC');const actor=await asRole(browser);const constraint=`CK_IssueAudit_${prefix}`
  try {
    const invoice=await draft(actor.api,c.customerId,actor.asOfDate)
    sql(`ALTER TABLE dbo.AuditLogs ADD CONSTRAINT ${constraint} CHECK (NOT (EntityName=N'Invoices' AND EntityId='${invoice.invoiceId}' AND Action=N'Invoice.Issue'));`)
    try {
      expect((await actor.api.post(`/api/invoices/${invoice.invoiceId}/issue`,{data:{rowVersion:invoice.rowVersion}})).status()).toBe(500)
      const after=await(await actor.api.get(`/api/invoices/${invoice.invoiceId}`)).json()
      expect(after.issueStatus).toBe('Draft');expect(after.invoiceNumber).toBeNull();expect(after.issuedAt).toBeNull()
      expect(after.rowVersion).toBe(invoice.rowVersion)
      expect((await(await actor.api.get(`/api/receivables?customerId=${c.customerId}`)).json()).total).toBe(0)
    }finally{sql(`ALTER TABLE dbo.AuditLogs DROP CONSTRAINT ${constraint};`)}
    expect((await actor.api.post(`/api/invoices/${invoice.invoiceId}/issue`,{data:{rowVersion:invoice.rowVersion}})).status()).toBe(200)
  }finally{await actor.close()}
})

test('Giao diện xác nhận phát hành, khóa sửa và mở công nợ',async({request,browser})=>{
  const c=await customer(request,'UI');const actor=await asRole(browser)
  const {page}=actor
  try {
    const invoice=await draft(actor.api,c.customerId,actor.asOfDate,-1,'1250.50')
    await page.getByRole('link',{name:'Hóa đơn',exact:true}).click()
    await page.getByLabel('Tìm hóa đơn').fill(String(invoice.invoiceId))
    await page.getByRole('button',{name:'Tìm kiếm',exact:true}).click()
    await page.getByRole('button',{name:`Xem hóa đơn ${invoice.invoiceId}`}).click()
    const details=page.getByRole('dialog')
    await details.getByRole('button',{name:'Phát hành mô phỏng',exact:true}).click()
    const confirm=details.getByRole('group',{name:'Xác nhận phát hành mô phỏng'})
    await expect(confirm).toContainText('1.250,50')
    await confirm.getByRole('button',{name:'Quay lại',exact:true}).click()
    await expect(confirm).not.toBeVisible()
    await details.getByRole('button',{name:'Phát hành mô phỏng',exact:true}).click()
    await confirm.getByRole('button',{name:'Xác nhận phát hành',exact:true}).click()
    await expect(details.getByRole('heading',{level:2})).toHaveText(/^SIM-/)
    await expect(details.getByText('Đã phát hành',{exact:true})).toBeVisible()
    await expect(details.getByRole('button',{name:'Chỉnh sửa nháp',exact:true})).toHaveCount(0)
    await expect(details.getByRole('button',{name:'Phát hành mô phỏng',exact:true})).toHaveCount(0)
    await page.screenshot({path:'test-results/invoice-issued.png',fullPage:true})
    await details.getByRole('button',{name:'Đóng',exact:true}).click()
    await page.getByRole('link',{name:'Công nợ',exact:true}).click()
    await page.getByLabel('Tìm công nợ').fill(c.customerCode)
    await page.getByRole('button',{name:'Tìm kiếm',exact:true}).click()
    await expect(page.getByRole('table')).toContainText('Quá hạn 1 ngày')
    await expect(page.locator('.receivable-stats')).toContainText('1.250,50')
    await page.screenshot({path:'test-results/receivables.png',fullPage:true})
    await page.getByLabel('Lọc công nợ quá hạn').selectOption('false')
    await expect(page.getByRole('heading',{name:'Không có khoản phải thu phù hợp',exact:true})).toBeVisible()
    await page.getByLabel('Lọc công nợ quá hạn').selectOption('true')
    await expect(page.getByRole('table')).toContainText('Quá hạn 1 ngày')
    await page.setViewportSize({width:390,height:844})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:'test-results/receivables-mobile.png',fullPage:true})
  }finally{await actor.close()}
})

test('Quyền phát hành và xem công nợ được kiểm tra tại API',async({request,browser})=>{
  expect((await request.get('/api/receivables')).status()).toBe(403)
  expect((await request.post('/api/invoices/9223372036854775807/issue',{data:{}})).status()).toBe(403)
  for(const role of ['manager','cashier']) {
    const actor=await asRole(browser,role)
    try {
      expect((await actor.api.get('/api/receivables')).status()).toBe(role==='manager'?200:403)
      expect((await actor.api.post('/api/invoices/9223372036854775807/issue',{data:{}})).status()).toBe(403)
    }finally{await actor.close()}
  }
  const anonymous=await apiRequest.newContext({baseURL:'http://localhost:5173'})
  try{expect((await anonymous.get('/api/receivables')).status()).toBe(401)}finally{await anonymous.dispose()}
})
