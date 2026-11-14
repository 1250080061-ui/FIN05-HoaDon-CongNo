import { test, expect, login, accounts } from './fixtures'
import { request as apiRequest } from '@playwright/test'
import type { Browser, APIRequestContext } from '@playwright/test'
import { execFileSync } from 'node:child_process'

const prefix=`ADJ${Date.now()}`,codes:string[]=[],accountCodes:string[]=[]
function sql(command:string){return execFileSync('sqlcmd.exe',['-S','localhost','-E','-C','-d','FIN05','-I','-b','-h','-1','-W','-Q',`SET NOCOUNT ON; SET ANSI_NULLS ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF; ${command}`],{encoding:'utf8'}).trim()}
test.afterAll(()=>{
  if(!codes.length)return
  if(![...codes,...accountCodes].every(c=>/^[A-Z0-9]+$/.test(c)))throw new Error('Unsafe cleanup')
  const cs=`SELECT CustomerId FROM dbo.Customers WHERE CustomerCode IN (${codes.map(c=>`'${c}'`).join(',')})`,invs=`SELECT InvoiceId FROM dbo.Invoices WHERE CustomerId IN (${cs})`,adj=`SELECT AdjustmentId FROM dbo.DebtAdjustments WHERE InvoiceId IN (${invs})`
  sql(`DELETE FROM dbo.AuditLogs WHERE EntityName='DebtAdjustments' AND EntityId IN (SELECT CONVERT(nvarchar(64),AdjustmentId) FROM dbo.DebtAdjustments WHERE InvoiceId IN (${invs})); DELETE FROM dbo.JournalEntryLines WHERE JournalEntryId IN (SELECT JournalEntryId FROM dbo.JournalEntries WHERE AdjustmentId IN (${adj})); DELETE FROM dbo.JournalEntries WHERE AdjustmentId IN (${adj}); DELETE FROM dbo.DebtAdjustmentLines WHERE AdjustmentId IN (${adj}); DELETE FROM dbo.DebtAdjustments WHERE InvoiceId IN (${invs}); DELETE FROM dbo.AuditLogs WHERE EntityName='DebtReminders' AND EntityId IN (SELECT CONVERT(nvarchar(64),ReminderId) FROM dbo.DebtReminders WHERE InvoiceId IN (${invs})); DELETE FROM dbo.DebtReminders WHERE InvoiceId IN (${invs}); DELETE FROM dbo.AuditLogs WHERE EntityName='Payments' AND EntityId IN (SELECT CONVERT(nvarchar(64),PaymentId) FROM dbo.Payments WHERE CustomerId IN (${cs})); DELETE FROM dbo.PaymentAllocations WHERE InvoiceId IN (${invs}); DELETE FROM dbo.Payments WHERE CustomerId IN (${cs}); DELETE FROM dbo.AuditLogs WHERE EntityName='Invoices' AND EntityId IN (SELECT CONVERT(nvarchar(64),InvoiceId) FROM dbo.Invoices WHERE CustomerId IN (${cs})); DELETE FROM dbo.Invoices WHERE CustomerId IN (${cs}); DELETE FROM dbo.AuditLogs WHERE EntityName='Customers' AND EntityId IN (SELECT CONVERT(nvarchar(64),CustomerId) FROM dbo.Customers WHERE CustomerCode IN (${codes.map(c=>`'${c}'`).join(',')})); DELETE FROM dbo.Customers WHERE CustomerId IN (${cs});`)
  if(accountCodes.length)sql(`DELETE FROM dbo.AccountingAccounts WHERE AccountCode IN (${accountCodes.map(c=>`'${c}'`).join(',')});`)
})
async function role(browser:Browser,name='admin'){
  const context=await browser.newContext({storageState:{cookies:[],origins:[]}}),{page,token}=await login(context,accounts.find(a=>a.role===name)!)
  const api=await apiRequest.newContext({baseURL:'http://localhost:5173',extraHTTPHeaders:{Authorization:`Bearer ${token}`}})
  return{api,page,close:async()=>{await api.dispose();await context.close()}}
}
async function setup(api:APIRequestContext,suffix:string,amount='100.25'){
  const customerCode=prefix+suffix;codes.push(customerCode)
  const cr=await api.post('/api/customers',{data:{customerCode,customerName:`Khách điều chỉnh ${suffix}`,phone:'0901234567'}});expect(cr.status()).toBe(201);const c=await cr.json()
  const date=(await(await api.get('/api/receivables')).json()).asOfDate as string
  let r=await api.post('/api/invoices',{data:{customerId:c.customerId,invoiceDate:date,dueDate:date,items:[{description:'Dịch vụ',quantity:'1',unitPrice:amount}]}});expect(r.status()).toBe(201);let i=await r.json()
  r=await api.post(`/api/invoices/${i.invoiceId}/issue`,{data:{rowVersion:i.rowVersion}});expect(r.status()).toBe(200);i=await r.json()
  return{c,i,date}
}
function body(i:{invoiceId:number;rowVersion:string},date:string,signed='50.10'){
  const n=Number(signed),amount=Math.abs(n).toFixed(2)
  return{invoiceId:i.invoiceId,invoiceRowVersion:i.rowVersion,adjustmentDate:date,signedAmount:signed,reason:'Điều chỉnh mô phỏng để đối chiếu công nợ.',lines:[{accountId:1,debitAmount:n>0?amount:'0',creditAmount:n<0?amount:'0'},{accountId:2,debitAmount:n<0?amount:'0',creditAmount:n>0?amount:'0'}]}
}
async function draft(api:APIRequestContext,i:{invoiceId:number;rowVersion:string},date:string,signed='50.10') {const r=await api.post('/api/adjustments',{data:body(i,date,signed)});expect(r.status()).toBe(201);return r.json()}
function versions(a:{rowVersion:string;invoiceRowVersion:string}){return{rowVersion:a.rowVersion,invoiceRowVersion:a.invoiceRowVersion}}
async function detail(api:APIRequestContext,id:number){const r=await api.get(`/api/adjustments/${id}`);expect(r.status()).toBe(200);return(await r.json()).detail}
async function post(api:APIRequestContext,a:{adjustmentId:number;rowVersion:string;invoiceRowVersion:string}){const r=await api.post(`/api/adjustments/${a.adjustmentId}/post`,{data:versions(a)});expect(r.status()).toBe(200);return r.json()}
async function payment(api:APIRequestContext,customerId:number,date:string,amount:string){let r=await api.post('/api/payments',{data:{customerId,paymentDate:date,amount,paymentMethod:'Cash'}});expect(r.status()).toBe(201);let p=await r.json();r=await api.post(`/api/payments/${p.paymentId}/confirm`,{data:{rowVersion:p.rowVersion}});expect(r.status()).toBe(200);p=await r.json();return p}

test('Điều chỉnh nháp/sửa/ghi nhận/đảo giữ nguyên hóa đơn, cân bằng chứng từ và nhật ký đúng người',async({browser})=>{
  const x=await role(browser)
  try{
    const {c,i,date}=await setup(x.api,'FLOW');let a=await draft(x.api,i,date)
    expect(a.status).toBe('Draft');expect(a.journalEntries).toHaveLength(0)
    expect((await(await x.api.get(`/api/receivables?customerId=${c.customerId}`)).json()).summary.remainingAmount).toBe('100.25')
    const update=await x.api.put(`/api/adjustments/${a.adjustmentId}`,{data:{...body(i,date,'25.15'),rowVersion:a.rowVersion}});expect(update.status()).toBe(200);a=await update.json()
    a=await post(x.api,a);expect(a.remainingAmount).toBe('125.40');expect(a.journalEntries).toHaveLength(1);expect(a.journalEntries[0]).toMatchObject({entryType:'Original',totalDebit:'25.15',totalCredit:'25.15'});expect(a.postedAt).toMatch(/Z$/)
    const balance=(await(await x.api.get(`/api/receivables?customerId=${c.customerId}`)).json()).items[0];expect(balance).toMatchObject({originalAmount:'100.25',adjustmentAmount:'25.15',remainingAmount:'125.40'})
    expect((await x.api.put(`/api/adjustments/${a.adjustmentId}`,{data:{...body(i,date),rowVersion:a.rowVersion}})).status()).toBe(409)
    const reverse=await x.api.post(`/api/adjustments/${a.adjustmentId}/reverse`,{data:{...versions(a),note:'Đảo để sửa sai chứng từ mô phỏng.'}});expect(reverse.status()).toBe(200);a=await reverse.json();expect(a.status).toBe('Reversed');expect(a.remainingAmount).toBe('100.25');expect(a.journalEntries).toHaveLength(2)
    const [original,reversed]=a.journalEntries
    expect(reversed.lines.map((l:{accountId:number;debitAmount:string;creditAmount:string})=>({accountId:l.accountId,debitAmount:l.debitAmount,creditAmount:l.creditAmount}))).toEqual(original.lines.map((l:{accountId:number;debitAmount:string;creditAmount:string})=>({accountId:l.accountId,debitAmount:l.creditAmount,creditAmount:l.debitAmount})))
    const me=await(await x.api.get('/api/me')).json();expect(sql(`SELECT COUNT(*) FROM dbo.AuditLogs WHERE EntityName='DebtAdjustments' AND EntityId='${a.adjustmentId}' AND UserId=${me.appUserId};`)).toBe('4')
    expect((await(await x.api.get(`/api/invoices/${i.invoiceId}`)).json()).totalAmount).toBe('100.25')
  }finally{await x.close()}
})

test('Chặn số tiền/bút toán sai, tài khoản vô hiệu và thay đổi dữ liệu sau khi lưu nháp',async({browser})=>{
  const x=await role(browser)
  try{
    const {i,date}=await setup(x.api,'BAD'),valid=body(i,date)
    for(const patch of [{signedAmount:'0'},{signedAmount:'1.001'},{reason:' '},{adjustmentDate:'2999-01-01'},{lines:[]},{lines:[{accountId:1,debitAmount:'50.10',creditAmount:'0'},{accountId:2,debitAmount:'0',creditAmount:'49'}]},{lines:[{accountId:1,debitAmount:'50.10',creditAmount:'1'},{accountId:2,debitAmount:'0',creditAmount:'49.10'}]},{lines:[{accountId:2,debitAmount:'50.10',creditAmount:'0'},{accountId:3,debitAmount:'0',creditAmount:'50.10'}]},{lines:[{accountId:99999999,debitAmount:'50.10',creditAmount:'0'},{accountId:2,debitAmount:'0',creditAmount:'50.10'}]}])expect((await x.api.post('/api/adjustments',{data:{...valid,...patch}})).status()).toBe(400)
    const code=prefix+'ACCOUNT';accountCodes.push(code)
    const accountId=Number(sql(`INSERT dbo.AccountingAccounts(AccountCode,AccountName,IsActive,IsReceivable) VALUES('${code}',N'Tài khoản thử riêng',1,0); SELECT SCOPE_IDENTITY();`))
    const data={...valid,lines:[valid.lines[0],{accountId,debitAmount:'0',creditAmount:'50.10'}]}
    const response=await x.api.post('/api/adjustments',{data});expect(response.status()).toBe(201);const a=await response.json()
    sql(`UPDATE dbo.AccountingAccounts SET IsActive=0 WHERE AccountId=${accountId} AND AccountCode='${code}';`)
    expect((await x.api.post(`/api/adjustments/${a.adjustmentId}/post`,{data:versions(a)})).status()).toBe(400)
    expect((await detail(x.api,a.adjustmentId)).journalEntries).toHaveLength(0)
  }finally{await x.close()}
})

test('Giảm công nợ không âm, chặn đảo tăng khi đã phân bổ; giới hạn số tiền',async({browser})=>{
  const x=await role(browser)
  try{
    const {c,i,date}=await setup(x.api,'LIMIT')
    expect((await x.api.post('/api/adjustments',{data:body(i,date,'-100.26')})).status()).toBe(400)
    let a=await post(x.api,await draft(x.api,i,date,'50.10'))
    const p=await payment(x.api,c.customerId,date,'150.35'),candidate=(await(await x.api.get(`/api/payments/${p.paymentId}/available-invoices`)).json()).items[0]
    expect((await x.api.post(`/api/payments/${p.paymentId}/allocations`,{data:{rowVersion:p.rowVersion,items:[{invoiceId:i.invoiceId,rowVersion:candidate.rowVersion,amount:'150.35'}]}})).status()).toBe(200)
    a=await detail(x.api,a.adjustmentId)
    expect((await x.api.post(`/api/adjustments/${a.adjustmentId}/reverse`,{data:{...versions(a),note:'Không thể làm công nợ âm'}})).status()).toBe(400)
    expect((await detail(x.api,a.adjustmentId)).status).toBe('Posted')
    const large=await setup(x.api,'MAX','999999999999.99')
    const over=body(large.i,date,'9999999999999999.99');over.lines=[{accountId:1,debitAmount:'9999999999999999.99',creditAmount:'0'},{accountId:2,debitAmount:'0',creditAmount:'9999999999999999.99'}]
    expect((await x.api.post('/api/adjustments',{data:over})).status()).toBe(400)
  }finally{await x.close()}
})

test('Đồng thời ghi nhận/đảo chỉ một lần; các nháp cạnh tranh cùng hóa đơn phải tải lại phiên bản',async({browser})=>{
  const x=await role(browser)
  try{
    const {i,date}=await setup(x.api,'RACE'),a=await draft(x.api,i,date),b=await draft(x.api,i,date,'-50.10')
    let responses=await Promise.all([1,2].map(()=>x.api.post(`/api/adjustments/${a.adjustmentId}/post`,{data:versions(a)})));expect(responses.map(r=>r.status()).sort()).toEqual([200,409])
    expect((await x.api.post(`/api/adjustments/${b.adjustmentId}/post`,{data:versions(b)})).status()).toBe(409)
    const current=await detail(x.api,a.adjustmentId)
    responses=await Promise.all([1,2].map(()=>x.api.post(`/api/adjustments/${a.adjustmentId}/reverse`,{data:{...versions(current),note:'Đảo thử đồng thời'}})));expect(responses.map(r=>r.status()).sort()).toEqual([200,409])
    expect((await detail(x.api,a.adjustmentId)).journalEntries).toHaveLength(2)
  }finally{await x.close()}
})

test('Phân bổ và điều chỉnh cạnh tranh cùng số dư không làm số dư âm',async({browser})=>{
  const x=await role(browser)
  try{
    const {c,i,date}=await setup(x.api,'ALLOC'),a=await draft(x.api,i,date,'-75.25'),p=await payment(x.api,c.customerId,date,'75.25')
    const results=await Promise.all([x.api.post(`/api/adjustments/${a.adjustmentId}/post`,{data:versions(a)}),x.api.post(`/api/payments/${p.paymentId}/allocations`,{data:{rowVersion:p.rowVersion,items:[{invoiceId:i.invoiceId,rowVersion:i.rowVersion,amount:'75.25'}]}})])
    expect(results.map(r=>r.status()).sort()).toEqual([200,409])
    expect((await(await x.api.get(`/api/receivables?customerId=${c.customerId}`)).json()).summary.remainingAmount).toBe('25.00')
  }finally{await x.close()}
})

test('Lỗi nhật ký hoàn tác nháp/ghi nhận/đảo, cả chứng từ, dòng và phiên bản hóa đơn',async({browser})=>{
  const x=await role(browser),constraint=`CK_AdjustmentAudit_${Date.now()}`
  try{
    const {i,date}=await setup(x.api,'ROLL')
    sql(`ALTER TABLE dbo.AuditLogs ADD CONSTRAINT [${constraint}] CHECK (NOT(EntityName='DebtAdjustments' AND Action='Adjustment.CreateDraft' AND JSON_VALUE(Description,'$.After.InvoiceId')=N'${i.invoiceId}'));`)
    try{expect((await x.api.post('/api/adjustments',{data:body(i,date)})).status()).toBe(500);expect((await(await x.api.get(`/api/adjustments?invoiceId=${i.invoiceId}`)).json()).total).toBe(0)}finally{sql(`ALTER TABLE dbo.AuditLogs DROP CONSTRAINT [${constraint}];`)}
    let a=await draft(x.api,i,date)
    for(const action of ['post','reverse']){
      sql(`ALTER TABLE dbo.AuditLogs ADD CONSTRAINT [${constraint}] CHECK (NOT(EntityName='DebtAdjustments' AND EntityId='${a.adjustmentId}' AND Action='Adjustment.${action==='post'?'Post':'Reverse'}'));`)
      try{
        expect((await x.api.post(`/api/adjustments/${a.adjustmentId}/${action}`,{data:{...versions(a),note:'Lỗi thử riêng'}})).status()).toBe(500)
        const saved=await detail(x.api,a.adjustmentId);expect(saved.rowVersion).toBe(a.rowVersion);expect(saved.invoiceRowVersion).toBe(a.invoiceRowVersion);expect(saved.status).toBe(a.status);expect(saved.journalEntries).toHaveLength(action==='post'?0:1)
      }finally{sql(`ALTER TABLE dbo.AuditLogs DROP CONSTRAINT [${constraint}];`)}
      if(action==='post')a=await post(x.api,a)
    }
    expect((await x.api.post(`/api/adjustments/${a.adjustmentId}/reverse`,{data:{...versions(a),note:'Đảo thành công'}})).status()).toBe(200)
  }finally{await x.close()}
})

test('Công nợ, nhắc nợ và phân bổ cùng tính điều chỉnh, nháp/đã đảo không ảnh hưởng',async({browser})=>{
  const x=await role(browser)
  try{
    const {c,i,date}=await setup(x.api,'READ'),a=await post(x.api,await draft(x.api,i,date,'-100.25'))
    const balances=await(await x.api.get(`/api/receivables?customerId=${c.customerId}`)).json();expect(balances.items[0]).toMatchObject({adjustmentAmount:'-100.25',remainingAmount:'0.00',paymentStatus:'Settled'})
    expect((await(await x.api.get(`/api/reminders/candidates?search=${c.customerCode}`)).json()).total).toBe(0)
    const p=await payment(x.api,c.customerId,date,'10')
    expect((await(await x.api.get(`/api/payments/${p.paymentId}/available-invoices`)).json()).total).toBe(0)
    expect((await x.api.post(`/api/adjustments/${a.adjustmentId}/reverse`,{data:{...versions(a),note:'Đảo giảm'}})).status()).toBe(200)
    expect((await(await x.api.get(`/api/reminders/candidates?search=${c.customerCode}`)).json()).items[0].remainingAmount).toBe('100.25')
    expect((await(await x.api.get(`/api/payments/${p.paymentId}/available-invoices`)).json()).items[0].remainingAmount).toBe('100.25')
    const current=await(await x.api.get(`/api/invoices/${i.invoiceId}`)).json()
    const reminder=await x.api.post('/api/reminders',{data:{invoiceId:i.invoiceId,invoiceRowVersion:current.rowVersion,scheduledDate:date,content:'Nhắc khoản nợ thử',contactChannel:'Phone',contactInfo:'0901234567'}});expect(reminder.status()).toBe(201)
    await post(x.api,await draft(x.api,current,date,'20.10'))
    const reminders=await(await x.api.get(`/api/reminders?search=${c.customerCode}`)).json();expect(reminders.items[0].remainingAmount).toBe('120.35')
  }finally{await x.close()}
})

test('Phân quyền điều chỉnh tại API và giao diện quản lý chỉ xem',async({browser})=>{
  const admin=await role(browser)
  try{
    const {i,date,c}=await setup(admin.api,'ROLE'),a=await draft(admin.api,i,date)
    for(const name of ['accountant','manager','sales','cashier']){
      const x=await role(browser,name)
      try{
        expect((await x.api.get('/api/adjustments')).status()).toBe(['accountant','manager'].includes(name)?200:403)
        expect((await x.api.get('/api/adjustments/accounts')).status()).toBe(['accountant','manager'].includes(name)?200:403)
        const response=await x.api.post('/api/adjustments',{data:body(i,date)})
        expect(response.status()).toBe(name==='accountant'?201:403)
        if(name!=='accountant')for(const action of ['post','reverse'])expect((await x.api.post(`/api/adjustments/${a.adjustmentId}/${action}`,{data:{...versions(a),note:'Không quyền'}})).status()).toBe(403)
        if(name==='manager'){
          await x.page.goto('/adjustments');await x.page.getByLabel('Tìm điều chỉnh',{exact:true}).fill(c.customerCode);await x.page.getByRole('button',{name:'Tìm kiếm',exact:true}).click();await x.page.getByRole('button',{name:`Xem điều chỉnh ${a.adjustmentId}`,exact:true}).click()
          await expect(x.page.getByRole('heading',{name:`Điều chỉnh #${a.adjustmentId}`,exact:true})).toBeVisible();await expect(x.page.getByRole('button',{name:'Ghi nhận điều chỉnh',exact:true})).toHaveCount(0)
        }
      }finally{await x.close()}
    }
    const anon=await apiRequest.newContext({baseURL:'http://localhost:5173'});expect((await anon.get('/api/adjustments')).status()).toBe(401);await anon.dispose()
  }finally{await admin.close()}
})

test('Giao diện lập/sửa nháp, xem trước, ghi nhận và đảo với chứng từ trên điện thoại',async({browser})=>{
  const x=await role(browser)
  try{
    const {c,i}=await setup(x.api,'UI')
    await x.page.goto('/adjustments');await x.page.getByRole('button',{name:'Chọn hóa đơn điều chỉnh',exact:true}).click();await x.page.getByLabel('Tìm điều chỉnh',{exact:true}).fill(c.customerCode);await x.page.getByRole('button',{name:'Tìm kiếm',exact:true}).click();await x.page.getByRole('button',{name:`Lập điều chỉnh ${i.invoiceNumber}`,exact:true}).click()
    await x.page.locator('#adjustment-amount').fill('-25.15');await x.page.getByRole('textbox',{name:'Lý do điều chỉnh',exact:true}).fill('Giảm giá trị phải thu theo kết quả đối chiếu mô phỏng.');await x.page.getByRole('button',{name:'Gợi ý hai dòng đối ứng',exact:true}).click();await x.page.getByRole('button',{name:'Kiểm tra điều chỉnh',exact:true}).click()
    await x.page.screenshot({path:'test-results/adjustment-review.png',fullPage:true});await x.page.getByRole('button',{name:'Lưu điều chỉnh nháp',exact:true}).click()
    await x.page.getByRole('button',{name:'Sửa điều chỉnh nháp',exact:true}).click();await x.page.getByRole('textbox',{name:'Lý do điều chỉnh',exact:true}).fill('Đã kiểm tra lại khoản giảm phải thu.');await x.page.getByRole('button',{name:'Kiểm tra điều chỉnh',exact:true}).click();await x.page.getByRole('button',{name:'Lưu điều chỉnh nháp',exact:true}).click()
    await x.page.getByRole('button',{name:'Ghi nhận điều chỉnh',exact:true}).click();await x.page.getByRole('button',{name:'Xác nhận ghi nhận',exact:true}).click();await expect(x.page.getByRole('dialog').getByRole('status')).toContainText('Đã ghi nhận điều chỉnh')
    await expect(x.page.locator('.journal-entry')).toHaveCount(1);await x.page.screenshot({path:'test-results/adjustment-posted.png',fullPage:true})
    await x.page.getByRole('button',{name:'Đảo điều chỉnh',exact:true}).click();await x.page.getByLabel('Lý do đảo *',{exact:true}).fill('Đảo để giữ lịch sử và sửa sai khoản điều chỉnh.');await x.page.getByRole('button',{name:'Xác nhận đảo điều chỉnh',exact:true}).click()
    await expect(x.page.locator('.journal-entry')).toHaveCount(2);await expect(x.page.getByRole('dialog').getByText('Đã đảo',{exact:true})).toBeVisible();await x.page.setViewportSize({width:390,height:844});await x.page.locator('.journal-entry').last().scrollIntoViewIfNeeded();await x.page.screenshot({path:'test-results/adjustment-reversed-mobile.png',fullPage:true})
    await x.page.getByRole('button',{name:'Đóng chi tiết điều chỉnh',exact:true}).click();await x.page.getByRole('button',{name:'Lịch sử điều chỉnh',exact:true}).click();await x.page.getByLabel('Trạng thái điều chỉnh',{exact:true}).selectOption('Reversed');await expect(x.page.getByRole('table')).toContainText('Đã đảo');await x.page.screenshot({path:'test-results/adjustments-mobile.png',fullPage:true});expect(await x.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  }finally{await x.close()}
})
