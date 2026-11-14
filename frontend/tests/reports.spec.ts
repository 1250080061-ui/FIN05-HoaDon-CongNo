import { test, expect, login, accounts } from './fixtures'
import { request as apiRequest } from '@playwright/test'
import type { Browser, APIRequestContext } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const prefix=`RPT${Date.now()}`,codes:string[]=[]
function sql(command:string){return execFileSync('sqlcmd.exe',['-S','localhost','-E','-C','-d','FIN05','-I','-b','-h','-1','-W','-Q',`SET NOCOUNT ON; SET ANSI_NULLS ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF; ${command}`],{encoding:'utf8'}).trim()}
test.afterAll(()=>{
  if(!codes.length)return
  if(!codes.every(c=>/^[A-Z0-9]+$/.test(c)))throw new Error('Unsafe cleanup')
  const cs=`SELECT CustomerId FROM dbo.Customers WHERE CustomerCode IN (${codes.map(c=>`'${c}'`).join(',')})`,invs=`SELECT InvoiceId FROM dbo.Invoices WHERE CustomerId IN (${cs})`,adj=`SELECT AdjustmentId FROM dbo.DebtAdjustments WHERE InvoiceId IN (${invs})`
  sql(`DELETE FROM dbo.AuditLogs WHERE EntityName='DebtAdjustments' AND EntityId IN (SELECT CONVERT(nvarchar(64),AdjustmentId) FROM dbo.DebtAdjustments WHERE InvoiceId IN (${invs})); DELETE FROM dbo.JournalEntryLines WHERE JournalEntryId IN (SELECT JournalEntryId FROM dbo.JournalEntries WHERE AdjustmentId IN (${adj})); DELETE FROM dbo.JournalEntries WHERE AdjustmentId IN (${adj}); DELETE FROM dbo.DebtAdjustmentLines WHERE AdjustmentId IN (${adj}); DELETE FROM dbo.DebtAdjustments WHERE InvoiceId IN (${invs}); DELETE FROM dbo.AuditLogs WHERE EntityName='Payments' AND EntityId IN (SELECT CONVERT(nvarchar(64),PaymentId) FROM dbo.Payments WHERE CustomerId IN (${cs})); DELETE FROM dbo.PaymentAllocations WHERE InvoiceId IN (${invs}); DELETE FROM dbo.Payments WHERE CustomerId IN (${cs}); DELETE FROM dbo.AuditLogs WHERE EntityName='Invoices' AND EntityId IN (SELECT CONVERT(nvarchar(64),InvoiceId) FROM dbo.Invoices WHERE CustomerId IN (${cs})); DELETE FROM dbo.Invoices WHERE CustomerId IN (${cs}); DELETE FROM dbo.AuditLogs WHERE EntityName='Customers' AND EntityId IN (SELECT CONVERT(nvarchar(64),CustomerId) FROM dbo.Customers WHERE CustomerId IN (${cs})); DELETE FROM dbo.Customers WHERE CustomerId IN (${cs});`)
})
async function role(browser:Browser,name='admin'){
  const context=await browser.newContext({storageState:{cookies:[],origins:[]}}),{page,token}=await login(context,accounts.find(a=>a.role===name)!)
  const api=await apiRequest.newContext({baseURL:'http://localhost:5173',extraHTTPHeaders:{Authorization:`Bearer ${token}`}})
  return{api,page,close:async()=>{await api.dispose();await context.close()}}
}
function day(base:string,offset:number){const d=new Date(`${base}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)}
async function customer(api:APIRequestContext,suffix:string,name?:string){const customerCode=prefix+suffix;codes.push(customerCode);const r=await api.post('/api/customers',{data:{customerCode,customerName:name??`Khách báo cáo ${suffix}`}});expect(r.status()).toBe(201);return r.json()}
async function today(api:APIRequestContext){const r=await api.get('/api/reports');expect(r.status()).toBe(200);return(await r.json()).asOfDate as string}
async function invoice(api:APIRequestContext,c:number,date:string,offset=0,amount='100.25',issue=true){let r=await api.post('/api/invoices',{data:{customerId:c,invoiceDate:day(date,-365),dueDate:day(date,offset),items:[{description:'Dịch vụ',quantity:'1',unitPrice:amount}]}});expect(r.status()).toBe(201);let i=await r.json();if(!issue)return i;r=await api.post(`/api/invoices/${i.invoiceId}/issue`,{data:{rowVersion:i.rowVersion}});expect(r.status()).toBe(200);i=await r.json();return i}
async function payment(api:APIRequestContext,c:number,date:string,amount='100.00',confirm=true){let r=await api.post('/api/payments',{data:{customerId:c,paymentDate:date,amount,paymentMethod:'Cash'}});expect(r.status()).toBe(201);let p=await r.json();if(!confirm)return p;r=await api.post(`/api/payments/${p.paymentId}/confirm`,{data:{rowVersion:p.rowVersion}});expect(r.status()).toBe(200);p=await r.json();return p}
async function adjust(api:APIRequestContext,i:{invoiceId:number;rowVersion:string},date:string,post=true){let r=await api.post('/api/adjustments',{data:{invoiceId:i.invoiceId,invoiceRowVersion:i.rowVersion,adjustmentDate:date,signedAmount:'20.10',reason:'Đối chiếu báo cáo',lines:[{accountId:1,debitAmount:'20.10',creditAmount:'0'},{accountId:2,debitAmount:'0',creditAmount:'20.10'}]}});expect(r.status()).toBe(201);let a=await r.json();if(!post)return a;r=await api.post(`/api/adjustments/${a.adjustmentId}/post`,{data:{rowVersion:a.rowVersion,invoiceRowVersion:a.invoiceRowVersion}});expect(r.status()).toBe(200);a=await r.json();return a}
async function report(api:APIRequestContext,path:string){const r=await api.get(`/api/reports?${path}`);expect(r.status()).toBe(200);return r.json()}
function parseCsv(text:string){const rows:string[][]=[];let row:string[]=[],cell='',quote=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++}else quote=!quote}else if(c===','&&!quote){row.push(cell);cell=''}else if(c==='\n'&&!quote){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}else cell+=c}return rows}

test('Báo cáo công nợ dùng đúng tổng điều chỉnh/phân bổ, loại nháp/hủy, tổng không phụ thuộc trang',async({browser})=>{
  const x=await role(browser)
  try{
    const c=await customer(x.api,'BAL'),date=await today(x.api),i=await invoice(x.api,c.customerId,date,-1),i2=await invoice(x.api,c.customerId,date,0,'200.50')
    await invoice(x.api,c.customerId,date,0,'300',false);const cancel=await invoice(x.api,c.customerId,date,0,'10',false);expect((await x.api.post(`/api/invoices/${cancel.invoiceId}/cancel`,{data:{rowVersion:cancel.rowVersion}})).status()).toBe(200)
    await adjust(x.api,i2,date,false);await adjust(x.api,i,date)
    const current=await(await x.api.get(`/api/invoices/${i.invoiceId}`)).json(),p=await payment(x.api,c.customerId,date,'50')
    expect((await x.api.post(`/api/payments/${p.paymentId}/allocations`,{data:{rowVersion:p.rowVersion,items:[{invoiceId:i.invoiceId,rowVersion:current.rowVersion,amount:'40.15'}]}})).status()).toBe(200)
    const r=await report(x.api,`customerId=${c.customerId}&pageSize=1&page=2`)
    expect(r.total).toBe(2);expect(r.items).toHaveLength(1);expect(r.summary).toMatchObject({originalAmount:'300.75',adjustmentAmount:'20.10',allocatedAmount:'40.15',remainingAmount:'280.70',overdueAmount:'80.20'})
    const balances=await(await x.api.get(`/api/receivables?customerId=${c.customerId}`)).json();expect(r.summary.remainingAmount).toBe(balances.summary.remainingAmount)
    expect((await report(x.api,`type=Overdue&customerId=${c.customerId}`)).items[0].remainingAmount).toBe('80.20')
  }finally{await x.close()}
})

test('Tuổi nợ đúng ranh giới ngày, lọc hạn thanh toán bao gồm hai đầu và khách ngừng hoạt động',async({browser})=>{
  const x=await role(browser)
  try{
    const c=await customer(x.api,'AGING'),date=await today(x.api)
    for(const offset of [-91,-90,-61,-60,-31,-30,-1,0,1])await invoice(x.api,c.customerId,date,offset,'10.25')
    expect((await x.api.patch(`/api/customers/${c.customerId}/status`,{data:{isActive:false,rowVersion:c.rowVersion}})).status()).toBe(200)
    const r=await report(x.api,`customerId=${c.customerId}`);expect(r.total).toBe(9);expect(r.summary.remainingAmount).toBe('92.25');expect(r.summary.overdueAmount).toBe('71.75')
    expect(r.aging.map((b:{count:number})=>b.count)).toEqual([2,2,2,2,1]);expect(r.aging.map((b:{amount:string})=>b.amount)).toEqual(['20.50','20.50','20.50','20.50','10.25'])
    const range=await report(x.api,`search=${c.customerCode}&fromDate=${day(date,-30)}&toDate=${date}`);expect(range.total).toBe(3)
    const late=await report(x.api,`type=Overdue&customerId=${c.customerId}`);expect(late.total).toBe(7);expect(late.aging[0].amount).toBe('0.00')
  }finally{await x.close()}
})

test('Thu tiền lọc ngày thu, chỉ phiếu xác nhận và không nhân tiền theo nhiều phân bổ',async({browser})=>{
  const x=await role(browser)
  try{
    const c=await customer(x.api,'CASH'),date=await today(x.api),old=day(date,-10),i=await invoice(x.api,c.customerId,date),i2=await invoice(x.api,c.customerId,date)
    const p=await payment(x.api,c.customerId,old,'100'),p2=await payment(x.api,c.customerId,date,'30');await payment(x.api,c.customerId,date,'999',false)
    expect((await x.api.post(`/api/payments/${p.paymentId}/allocations`,{data:{rowVersion:p.rowVersion,items:[{invoiceId:i.invoiceId,rowVersion:i.rowVersion,amount:'40'},{invoiceId:i2.invoiceId,rowVersion:i2.rowVersion,amount:'30'}]}})).status()).toBe(200)
    let r=await report(x.api,`type=Collections&customerId=${c.customerId}`);expect(r.total).toBe(2);expect(r.summary).toMatchObject({collectedAmount:'130.00',allocatedAmount:'70.00',unallocatedAmount:'60.00'})
    r=await report(x.api,`type=Collections&customerId=${c.customerId}&fromDate=${old}&toDate=${old}`);expect(r.total).toBe(1);expect(r.summary).toMatchObject({collectedAmount:'100.00',allocatedAmount:'70.00',unallocatedAmount:'30.00'});expect(r.basis).toBe('PaymentDateCurrentAllocation')
    r=await report(x.api,`type=Collections&search=${p2.paymentNumber}`);expect(r.total).toBe(1)
  }finally{await x.close()}
})

test('Báo cáo rỗng/dữ liệu lọc sai và tra cứu không thay đổi dữ liệu nghiệp vụ',async({browser})=>{
  const x=await role(browser)
  try{
    const c=await customer(x.api,'EMPTY'),before=sql('SELECT COUNT(*) FROM dbo.AuditLogs;')
    for(const type of ['Receivables','Overdue','Collections']){const r=await report(x.api,`type=${type}&customerId=${c.customerId}`);expect(r.items).toHaveLength(0);expect(r.total).toBe(0);expect(r.summary.remainingAmount).toBe('0.00');expect((await x.api.get(`/api/reports/export?type=${type}&customerId=${c.customerId}`)).status()).toBe(200)}
    expect(sql('SELECT COUNT(*) FROM dbo.AuditLogs;')).toBe(before)
    for(const query of ['type=Bad','page=0','pageSize=101','customerId=0','fromDate=2027-01-01&toDate=2026-01-01','fromDate=bad','page=2147483647&pageSize=100','search='+'x'.repeat(201)])for(const path of ['/api/reports?','/api/reports/export?'])expect((await x.api.get(path+query)).status()).toBe(400)
  }finally{await x.close()}
})

test('CSV toàn bộ trang, UTF-8 tiếng Việt, bảo vệ ô công thức và chặn xuất quá 10000 dòng',async({browser})=>{
  const x=await role(browser)
  try{
    const c=await customer(x.api,'CSV','=1+1,"Khách Việt"\nTên thứ hai'),date=await today(x.api)
    for(let n=0;n<3;n++)await invoice(x.api,c.customerId,date,n,'10.25')
    const response=await x.api.get(`/api/reports/export?customerId=${c.customerId}&pageSize=1&page=2`);expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('text/csv')
    const bytes=await response.body();expect([...bytes.subarray(0,3)]).toEqual([239,187,191])
    const rows=parseCsv(bytes.toString('utf8').replace(/^\uFEFF/,'')),data=rows.filter(r=>r[1]===c.customerCode)
    expect(data).toHaveLength(3);expect(data[0][2]).toBe('\'=1+1,"Khách Việt"\nTên thứ hai');expect(rows.find(r=>r[0]==='TỔNG')?.[7]).toBe('30.75')
    const big=await customer(x.api,'BIG'),me=await(await x.api.get('/api/me')).json()
    sql(`INSERT dbo.Invoices(InvoiceNumber,CustomerId,CreatedByUserId,InvoiceDate,DueDate,TotalAmount,IssueStatus,IssuedAt) SELECT '${prefix}X'+CONVERT(varchar(10),n),${big.customerId},${me.appUserId},'${date}','${date}',1,'Issued',SYSUTCDATETIME() FROM (SELECT TOP(10001) ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS n FROM sys.all_objects a CROSS JOIN sys.all_objects b) src;`)
    expect((await x.api.get(`/api/reports/export?customerId=${big.customerId}`)).status()).toBe(400)
    expect((await report(x.api,`customerId=${big.customerId}&pageSize=1`)).total).toBe(10001)
  }finally{await x.close()}
})

test('Phân quyền báo cáo và CSV, ban quản lý xem được; sales/cashier/khách bị chặn',async({browser})=>{
  for(const name of ['admin','accountant','manager','sales','cashier']){
    const x=await role(browser,name)
    try{
      const allowed=['admin','accountant','manager'].includes(name)
      for(const path of ['/api/reports?search=NONE'+prefix,'/api/reports/export?search=NONE'+prefix])expect((await x.api.get(path)).status()).toBe(allowed?200:403)
      if(name==='manager'){await x.page.goto('/reports');await expect(x.page.getByRole('heading',{name:'Báo cáo thống kê',exact:true})).toBeVisible();await expect(x.page.getByRole('button',{name:'Xuất CSV',exact:true})).toBeEnabled()}
    }finally{await x.close()}
  }
  const anon=await apiRequest.newContext({baseURL:'http://localhost:5173'});expect((await anon.get('/api/reports')).status()).toBe(401);expect((await anon.get('/api/reports/export')).status()).toBe(401);await anon.dispose()
})

test('Giao diện báo cáo, lọc khách/ngày, CSV theo bộ lọc đã áp dụng và bố cục điện thoại',async({browser})=>{
  const x=await role(browser)
  try{
    const c=await customer(x.api,'UI'),date=await today(x.api);await invoice(x.api,c.customerId,date,-1,'1250.50')
    await x.page.goto('/reports');await x.page.locator('#report-customer-search').fill(c.customerCode);await expect(x.page.locator('#report-customer option')).toHaveCount(2);await x.page.locator('#report-customer').selectOption(String(c.customerId));await x.page.getByRole('button',{name:'Xem báo cáo',exact:true}).click()
    await expect(x.page.getByRole('table')).toContainText('1.250,50');await x.page.screenshot({path:'test-results/reports-desktop.png',fullPage:true})
    await x.page.locator('#report-search').fill('BỘ LỌC CHƯA ÁP DỤNG')
    const pending=x.page.waitForEvent('download');await x.page.getByRole('button',{name:'Xuất CSV',exact:true}).click();const download=await pending;expect(download.suggestedFilename()).toMatch(/FIN05-Receivables/);const file=await download.path();expect(file).toBeTruthy();expect(readFileSync(file!,'utf8')).toContain(c.customerCode);expect(readFileSync(file!,'utf8')).not.toContain('BỘ LỌC CHƯA ÁP DỤNG')
    await x.page.locator('#report-search').fill('');await x.page.locator('#report-type').selectOption('Overdue');await x.page.locator('#report-from').fill(day(date,-1));await x.page.locator('#report-to').fill(day(date,-1));await x.page.getByRole('button',{name:'Xem báo cáo',exact:true}).click();await expect(x.page.getByRole('table')).toContainText('1 ngày')
    await x.page.setViewportSize({width:390,height:844});await x.page.screenshot({path:'test-results/reports-mobile.png',fullPage:true});expect(await x.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
    await x.page.locator('#report-type').selectOption('Collections');await x.page.getByRole('button',{name:'Xem báo cáo',exact:true}).click();await expect(x.page.getByRole('heading',{name:'Không có dữ liệu phù hợp',exact:true})).toBeVisible()
  }finally{await x.close()}
})

test('Giao diện báo lỗi truy vấn/xuất và thử lại được, không hiển thị tổng cũ khi lỗi',async({browser})=>{
  const x=await role(browser)
  try{
    await x.page.route('**/api/reports?**',route=>route.fulfill({status:500,contentType:'application/problem+json',body:'{"title":"Lỗi báo cáo thử"}'}))
    await x.page.goto('/reports');await expect(x.page.getByRole('heading',{name:'Chưa lập được báo cáo',exact:true})).toBeVisible();await expect(x.page.getByRole('button',{name:'Xuất CSV',exact:true})).toBeDisabled()
    await x.page.unroute('**/api/reports?**');await x.page.getByRole('button',{name:'Thử lại',exact:true}).click();await expect(x.page.getByRole('button',{name:'Xuất CSV',exact:true})).toBeEnabled()
    await x.page.route('**/api/reports/export?**',route=>route.fulfill({status:500,contentType:'application/problem+json',body:'{"title":"Lỗi xuất thử"}'}));await x.page.getByRole('button',{name:'Xuất CSV',exact:true}).click();await expect(x.page.getByRole('alert')).toContainText('Lỗi xuất thử');await expect(x.page.getByRole('button',{name:'Xuất CSV',exact:true})).toBeEnabled()
  }finally{await x.close()}
})
