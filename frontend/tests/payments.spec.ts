import { test, expect, login, accounts } from './fixtures'
import { request as apiRequest } from '@playwright/test'
import type { Browser, APIRequestContext } from '@playwright/test'
import { execFileSync } from 'node:child_process'

const prefix = `PAY${Date.now()}`
const codes: string[] = []
function sql(command: string) {
  return execFileSync('sqlcmd.exe', ['-S','localhost','-E','-C','-d','FIN05','-I','-b','-h','-1','-W','-Q', `SET NOCOUNT ON; SET ANSI_NULLS ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF; ${command}`], {encoding:'utf8'}).trim()
}
test.afterAll(() => {
  if (!codes.length) return
  if (!codes.every(x => /^[A-Z0-9]+$/.test(x))) throw new Error('Unsafe cleanup')
  const cs = `SELECT CustomerId FROM dbo.Customers WHERE CustomerCode IN (${codes.map(x => `'${x}'`).join(',')})`
  const ps = `SELECT PaymentId FROM dbo.Payments WHERE CustomerId IN (${cs})`
  sql(`DELETE FROM dbo.AuditLogs WHERE EntityName=N'Payments' AND EntityId IN (SELECT CONVERT(nvarchar(64),PaymentId) FROM dbo.Payments WHERE CustomerId IN (${cs})); DELETE FROM dbo.PaymentAllocations WHERE PaymentId IN (${ps}); DELETE FROM dbo.Payments WHERE CustomerId IN (${cs}); DELETE FROM dbo.AuditLogs WHERE EntityName=N'Invoices' AND EntityId IN (SELECT CONVERT(nvarchar(64),InvoiceId) FROM dbo.Invoices WHERE CustomerId IN (${cs})); DELETE FROM dbo.Invoices WHERE CustomerId IN (${cs}); DELETE FROM dbo.AuditLogs WHERE EntityName=N'Customers' AND EntityId IN (SELECT CONVERT(nvarchar(64),CustomerId) FROM dbo.Customers WHERE CustomerId IN (${cs})); DELETE FROM dbo.Customers WHERE CustomerId IN (${cs});`)
})
async function role(browser: Browser, name='admin') {
  const context = await browser.newContext({storageState:{cookies:[],origins:[]}})
  const { page, token } = await login(context, accounts.find(a => a.role === name)!)
  const api = await apiRequest.newContext({baseURL:'http://localhost:5173', extraHTTPHeaders:{Authorization:`Bearer ${token}`}})
  return {page,api,close:async()=>{await api.dispose();await context.close()}}
}
async function customer(api:APIRequestContext,suffix:string) {
  const customerCode=prefix+suffix; codes.push(customerCode)
  const r=await api.post('/api/customers',{data:{customerCode,customerName:`Khách phiếu thu ${suffix}`}})
  expect(r.status()).toBe(201);return r.json()
}
async function date(api:APIRequestContext) { return (await(await api.get('/api/receivables')).json()).asOfDate as string }
async function payment(api:APIRequestContext,customerId:number,day:string,amount='100.00',confirm=true) {
  const r=await api.post('/api/payments',{data:{customerId,paymentDate:day,amount,paymentMethod:'Cash'}})
  expect(r.status()).toBe(201); const p=await r.json()
  if(!confirm) return p
  const confirmed=await api.post(`/api/payments/${p.paymentId}/confirm`,{data:{rowVersion:p.rowVersion}})
  expect(confirmed.status()).toBe(200);return confirmed.json()
}
async function invoice(api:APIRequestContext,customerId:number,day:string,amount='100.00',issue=true) {
  const r=await api.post('/api/invoices',{data:{customerId,invoiceDate:day,dueDate:day,items:[{description:'Dịch vụ',quantity:'1',unitPrice:amount}]}})
  expect(r.status()).toBe(201);const i=await r.json()
  if(!issue)return i
  const issued=await api.post(`/api/invoices/${i.invoiceId}/issue`,{data:{rowVersion:i.rowVersion}})
  expect(issued.status()).toBe(200);return issued.json()
}
function alloc(p:{rowVersion:string}, i:{invoiceId:number;rowVersion:string},amount='50.00') {return {rowVersion:p.rowVersion,items:[{invoiceId:i.invoiceId,rowVersion:i.rowVersion,amount}]}}

test('Phiếu thu nháp: kiểm tra dữ liệu, sửa phiên bản, xác nhận khóa sửa và ghi đúng người',async({browser})=>{
  const a=await role(browser)
  try {
    const c=await customer(a.api,'DRAFT'), day=await date(a.api)
    const data={customerId:c.customerId,paymentDate:day,amount:'20.12',paymentMethod:'Cash'}
    for(const change of [{amount:'0'},{amount:'-1'},{amount:'1.001'},{paymentMethod:'Other'},{paymentMethod:'BankTransfer'},{customerId:0},{paymentDate:'2999-01-01'},{paymentDate:null}])
      expect((await a.api.post('/api/payments',{data:{...data,...change}})).status()).toBe(400)
    let p=await payment(a.api,c.customerId,day,'20.12',false)
    expect(p.status).toBe('Draft');expect(p.unallocatedAmount).toBe('20.12')
    expect((await a.api.post(`/api/payments/${p.paymentId}/allocations`,{data:alloc(p,{invoiceId:1,rowVersion:p.rowVersion})})).status()).toBe(409)
    const old=p.rowVersion
    const update=await a.api.put(`/api/payments/${p.paymentId}`,{data:{...data,amount:'30.15',rowVersion:p.rowVersion}})
    expect(update.status()).toBe(200);p=await update.json()
    expect((await a.api.post(`/api/payments/${p.paymentId}/confirm`,{data:{rowVersion:old}})).status()).toBe(409)
    const r=await a.api.post(`/api/payments/${p.paymentId}/confirm`,{data:{rowVersion:p.rowVersion}})
    expect(r.status()).toBe(200);p=await r.json();expect(p.status).toBe('Confirmed');expect(p.confirmedAt).toMatch(/Z$/)
    expect((await a.api.put(`/api/payments/${p.paymentId}`,{data:{...data,rowVersion:p.rowVersion}})).status()).toBe(409)
    expect((await a.api.post(`/api/payments/${p.paymentId}/confirm`,{data:{rowVersion:p.rowVersion}})).status()).toBe(409)
    const me=await(await a.api.get('/api/me')).json()
    expect(sql(`SELECT COUNT(*) FROM dbo.AuditLogs WHERE EntityName='Payments' AND EntityId='${p.paymentId}' AND UserId=${me.appUserId};`)).toBe('3')
    const list=await(await a.api.get(`/api/payments?search=${c.customerCode}&status=Confirmed`)).json()
    expect(list.total).toBe(1);expect(list.items[0].amount).toBe('30.15')
  }finally{await a.close()}
})

test('Phân bổ nhiều hóa đơn: giảm đúng công nợ, giữ tiền dư và thanh toán đủ',async({browser})=>{
  const a=await role(browser)
  try{
    const c=await customer(a.api,'BAL'),day=await date(a.api)
    const yesterday=new Date(`${day}T00:00:00Z`);yesterday.setUTCDate(yesterday.getUTCDate()-1)
    const priorDay=yesterday.toISOString().slice(0,10)
    const i1=await invoice(a.api,c.customerId,priorDay,'100.25'),i2=await invoice(a.api,c.customerId,priorDay,'99.75')
    let p=await payment(a.api,c.customerId,day,'250.00')
    const r=await a.api.post(`/api/payments/${p.paymentId}/allocations`,{data:{rowVersion:p.rowVersion,items:[{invoiceId:i1.invoiceId,rowVersion:i1.rowVersion,amount:'40.10'},{invoiceId:i2.invoiceId,rowVersion:i2.rowVersion,amount:'99.75'}]}})
    expect(r.status()).toBe(200);p=await r.json();expect(p.allocatedAmount).toBe('139.85');expect(p.unallocatedAmount).toBe('110.15')
    let balances=await(await a.api.get(`/api/receivables?customerId=${c.customerId}`)).json()
    expect(balances.summary.remainingAmount).toBe('60.15')
    expect(balances.summary.overdueAmount).toBe('60.15')
    expect((await(await a.api.get(`/api/receivables?customerId=${c.customerId}&overdue=true`)).json()).total).toBe(1)
    expect(balances.items.find((x:{invoiceId:number})=>x.invoiceId===i1.invoiceId)).toMatchObject({paidAmount:'40.10',remainingAmount:'60.15',paymentStatus:'PartiallyPaid'})
    expect(balances.items.find((x:{invoiceId:number})=>x.invoiceId===i2.invoiceId)).toMatchObject({remainingAmount:'0.00',paymentStatus:'Paid',isOverdue:false})
    const candidates=await(await a.api.get(`/api/payments/${p.paymentId}/available-invoices`)).json()
    expect(candidates.total).toBe(1)
    const second=await a.api.post(`/api/payments/${p.paymentId}/allocations`,{data:alloc(p,candidates.items[0],'60.15')})
    expect(second.status()).toBe(200);p=await second.json();expect(p.unallocatedAmount).toBe('50.00')
    balances=await(await a.api.get(`/api/receivables?customerId=${c.customerId}`)).json()
    expect(balances.summary.remainingAmount).toBe('0.00');expect(balances.items.every((x:{paymentStatus:string})=>x.paymentStatus==='Paid')).toBe(true)
    expect((await(await a.api.get(`/api/receivables?customerId=${c.customerId}&overdue=true`)).json()).total).toBe(0)
    expect((await(await a.api.get(`/api/payments/${p.paymentId}/available-invoices`)).json()).total).toBe(0)
    expect(p.allocations).toHaveLength(3)
  }finally{await a.close()}
})

test('Chặn phân bổ sai khách, nháp, trùng dòng, vượt tiền và phiên bản cũ; không lưu dở dang',async({browser})=>{
  const a=await role(browser)
  try{
    const c=await customer(a.api,'BAD'),other=await customer(a.api,'OTHER'),day=await date(a.api)
    const i=await invoice(a.api,c.customerId,day),wrong=await invoice(a.api,other.customerId,day),draft=await invoice(a.api,c.customerId,day,'100',false)
    const p=await payment(a.api,c.customerId,day,'200.00')
    for(const body of [alloc(p,wrong),alloc(p,draft),alloc(p,i,'100.01'),alloc(p,i,'201'),alloc(p,i,'0'),alloc(p,i,'1.001'),{rowVersion:p.rowVersion,items:[]},{rowVersion:p.rowVersion,items:[...alloc(p,i).items,...alloc(p,i).items]}, {rowVersion:p.rowVersion,items:[...alloc(p,i).items,...alloc(p,wrong).items]}])
      expect((await a.api.post(`/api/payments/${p.paymentId}/allocations`,{data:body})).status()).toBe(400)
    expect((await(await a.api.get(`/api/payments/${p.paymentId}`)).json()).allocatedAmount).toBe('0.00')
    expect((await a.api.post(`/api/payments/${p.paymentId}/allocations`,{data:alloc(p,i)})).status()).toBe(200)
    expect((await a.api.post(`/api/payments/${p.paymentId}/allocations`,{data:alloc(p,i)})).status()).toBe(409)
    const p2=await payment(a.api,c.customerId,day)
    expect((await a.api.post(`/api/payments/${p2.paymentId}/allocations`,{data:alloc(p2,i)})).status()).toBe(409)
  }finally{await a.close()}
})

test('Hai yêu cầu cùng phiếu chỉ phân bổ một lần',async({browser})=>{
  const a=await role(browser)
  try{
    const c=await customer(a.api,'RACE'),day=await date(a.api),i=await invoice(a.api,c.customerId,day),p=await payment(a.api,c.customerId,day)
    const results=await Promise.all([1,2].map(()=>a.api.post(`/api/payments/${p.paymentId}/allocations`,{data:alloc(p,i,'75.00')})))
    expect(results.map(x=>x.status()).sort()).toEqual([200,409])
    const saved=await(await a.api.get(`/api/payments/${p.paymentId}`)).json();expect(saved.allocatedAmount).toBe('75.00');expect(saved.allocations).toHaveLength(1)
  }finally{await a.close()}
})

test('Hai phiếu cạnh tranh một hóa đơn không thu vượt công nợ',async({browser})=>{
  const a=await role(browser)
  try{
    const c=await customer(a.api,'RACEINV'),day=await date(a.api),i=await invoice(a.api,c.customerId,day)
    const p1=await payment(a.api,c.customerId,day),p2=await payment(a.api,c.customerId,day)
    const results=await Promise.all([p1,p2].map(p=>a.api.post(`/api/payments/${p.paymentId}/allocations`,{data:alloc(p,i,'75.00')})))
    expect(results.map(x=>x.status()).sort()).toEqual([200,409])
    const b=await(await a.api.get(`/api/receivables?customerId=${c.customerId}`)).json();expect(b.summary.remainingAmount).toBe('25.00')
  }finally{await a.close()}
})

test('Lỗi nhật ký hoàn tác xác nhận và toàn bộ phân bổ, kể cả rowversion',async({browser})=>{
  const a=await role(browser);const constraint=`CK_PaymentAudit_${Date.now()}`
  try{
    const c=await customer(a.api,'ROLLBACK'),day=await date(a.api),i=await invoice(a.api,c.customerId,day)
    sql(`ALTER TABLE dbo.AuditLogs ADD CONSTRAINT [${constraint}] CHECK (NOT(EntityName=N'Payments' AND Action=N'Payment.CreateDraft' AND JSON_VALUE(Description,'$.After.CustomerId')=N'${c.customerId}'));`)
    try{
      expect((await a.api.post('/api/payments',{data:{customerId:c.customerId,paymentDate:day,amount:'100',paymentMethod:'Cash'}})).status()).toBe(500)
      expect((await(await a.api.get(`/api/payments?search=${c.customerCode}`)).json()).total).toBe(0)
    }finally{sql(`ALTER TABLE dbo.AuditLogs DROP CONSTRAINT [${constraint}];`)}
    let p=await payment(a.api,c.customerId,day,'100',false)
    sql(`ALTER TABLE dbo.AuditLogs ADD CONSTRAINT [${constraint}] CHECK (NOT(EntityName=N'Payments' AND EntityId=N'${p.paymentId}' AND Action IN (N'Payment.Confirm',N'Payment.Allocate')));`)
    try{
      expect((await a.api.post(`/api/payments/${p.paymentId}/confirm`,{data:{rowVersion:p.rowVersion}})).status()).toBe(500)
      expect(await(await a.api.get(`/api/payments/${p.paymentId}`)).json()).toMatchObject({status:'Draft',confirmedAt:null,rowVersion:p.rowVersion})
    }finally{sql(`ALTER TABLE dbo.AuditLogs DROP CONSTRAINT [${constraint}];`)}
    p=await(await a.api.post(`/api/payments/${p.paymentId}/confirm`,{data:{rowVersion:p.rowVersion}})).json()
    sql(`ALTER TABLE dbo.AuditLogs ADD CONSTRAINT [${constraint}] CHECK (NOT(EntityName=N'Payments' AND EntityId=N'${p.paymentId}' AND Action=N'Payment.Allocate'));`)
    try{
      expect((await a.api.post(`/api/payments/${p.paymentId}/allocations`,{data:alloc(p,i)})).status()).toBe(500)
      expect(await(await a.api.get(`/api/payments/${p.paymentId}`)).json()).toMatchObject({allocatedAmount:'0.00',rowVersion:p.rowVersion})
      expect((await(await a.api.get(`/api/invoices/${i.invoiceId}`)).json()).rowVersion).toBe(i.rowVersion)
    }finally{sql(`ALTER TABLE dbo.AuditLogs DROP CONSTRAINT [${constraint}];`)}
    expect((await a.api.post(`/api/payments/${p.paymentId}/allocations`,{data:alloc(p,i)})).status()).toBe(200)
  }finally{await a.close()}
})

test('Phân quyền thu tiền / kế toán / quản lý / kinh doanh tại API',async({browser})=>{
  const admin=await role(browser)
  try{
    const c=await customer(admin.api,'ROLE'),day=await date(admin.api),i=await invoice(admin.api,c.customerId,day)
    for(const name of ['cashier','accountant','manager','sales']){
      const a=await role(browser,name)
      try{
        expect((await a.api.get('/api/payments')).status()).toBe(name==='sales'?403:200)
        const r=await a.api.post('/api/payments',{data:{customerId:c.customerId,paymentDate:day,amount:'100',paymentMethod:'Cash'}})
        expect(r.status()).toBe(name==='cashier'?201:403)
        if(name==='cashier'){
          const p=await r.json()
          expect((await a.api.post(`/api/payments/${p.paymentId}/confirm`,{data:{rowVersion:p.rowVersion}})).status()).toBe(200)
          expect((await a.api.post(`/api/payments/${p.paymentId}/allocations`,{data:alloc(p,i)})).status()).toBe(403)
        }else{
          const p=await payment(admin.api,c.customerId,day)
          expect((await a.api.post(`/api/payments/${p.paymentId}/allocations`,{data:alloc(p,i,'10')})).status()).toBe(name==='accountant'?200:403)
        }
      }finally{await a.close()}
    }
    const anonymous=await apiRequest.newContext({baseURL:'http://localhost:5173'})
    expect((await anonymous.get('/api/payments')).status()).toBe(401);await anonymous.dispose()
  }finally{await admin.close()}
})

test('Giao diện lập, xác nhận, kiểm tra phân bổ và xem công nợ trên máy tính / điện thoại',async({browser})=>{
  const a=await role(browser)
  try{
    const c=await customer(a.api,'UI'),day=await date(a.api),i=await invoice(a.api,c.customerId,day,'1250.50')
    await a.page.goto('/payments')
    await a.page.getByRole('button',{name:'＋ Lập phiếu thu',exact:true}).click()
    await a.page.getByLabel('Tìm khách hàng',{exact:true}).fill(c.customerCode)
    await expect(a.page.locator('#payment-customer option')).toHaveCount(2)
    await a.page.locator('#payment-customer').selectOption(String(c.customerId))
    await a.page.getByLabel('Số tiền (VND) *',{exact:true}).fill('1500.75')
    await a.page.getByRole('button',{name:'Lưu phiếu thu nháp',exact:true}).click()
    await a.page.getByRole('button',{name:'Xác nhận phiếu thu',exact:true}).click()
    await a.page.getByRole('button',{name:'Đồng ý xác nhận',exact:true}).click()
    await expect(a.page.getByRole('button',{name:'Sửa nháp',exact:true})).toHaveCount(0)
    await a.page.getByRole('button',{name:'Phân bổ vào hóa đơn',exact:true}).click()
    await a.page.getByLabel(`Phân bổ ${i.invoiceNumber}`,{exact:true}).fill('1250.50')
    await a.page.getByRole('button',{name:'Kiểm tra phân bổ',exact:true}).click()
    await a.page.screenshot({path:'test-results/payment-allocation-confirm.png',fullPage:true})
    await a.page.getByRole('button',{name:'Xác nhận phân bổ',exact:true}).click()
    await expect(a.page.getByRole('dialog').getByRole('status')).toContainText('Đã phân bổ thanh toán')
    await a.page.screenshot({path:'test-results/payment-allocated.png',fullPage:true})
    await a.page.getByRole('button',{name:'Đóng chi tiết phiếu thu',exact:true}).click()
    await a.page.goto('/receivables')
    await a.page.getByLabel('Tìm công nợ',{exact:true}).fill(c.customerCode)
    await a.page.getByRole('button',{name:'Tìm kiếm',exact:true}).click()
    await expect(a.page.getByRole('cell',{name:'Đã thanh toán',exact:true})).toBeVisible()
    await a.page.goto('/payments');await a.page.setViewportSize({width:390,height:844})
    await a.page.getByLabel('Tìm phiếu thu',{exact:true}).fill(c.customerCode)
    await a.page.getByRole('button',{name:'Tìm kiếm',exact:true}).click()
    await expect(a.page.getByRole('button',{name:/Xem phiếu thu/})).toHaveCount(1)
    await a.page.screenshot({path:'test-results/payments-mobile.png',fullPage:true})
    expect(await a.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
    await a.page.getByRole('button',{name:/Xem phiếu thu/}).click()
    await expect(a.page.getByRole('heading',{name:'Lịch sử phân bổ',exact:true})).toBeVisible()
    await a.page.screenshot({path:'test-results/payment-detail-mobile.png',fullPage:true})
  }finally{await a.close()}
})
