import { test, expect, login, accounts } from './fixtures'
import { request as apiRequest } from '@playwright/test'
import type { Browser, APIRequestContext } from '@playwright/test'
import { execFileSync } from 'node:child_process'

const prefix=`REM${Date.now()}`
const codes:string[]=[]
function sql(command:string){return execFileSync('sqlcmd.exe',['-S','localhost','-E','-C','-d','FIN05','-I','-b','-h','-1','-W','-Q',`SET NOCOUNT ON; SET ANSI_NULLS ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF; ${command}`],{encoding:'utf8'}).trim()}
test.afterAll(()=>{
  if(!codes.length)return
  if(!codes.every(c=>/^[A-Z0-9]+$/.test(c)))throw new Error('Unsafe test code')
  const cs=`SELECT CustomerId FROM dbo.Customers WHERE CustomerCode IN (${codes.map(c=>`'${c}'`).join(',')})`
  const invoices=`SELECT InvoiceId FROM dbo.Invoices WHERE CustomerId IN (${cs})`
  sql(`DELETE FROM dbo.AuditLogs WHERE EntityName=N'DebtReminders' AND EntityId IN (SELECT CONVERT(nvarchar(64),ReminderId) FROM dbo.DebtReminders WHERE InvoiceId IN (${invoices})); DELETE FROM dbo.DebtReminders WHERE InvoiceId IN (${invoices}); DELETE FROM dbo.AuditLogs WHERE EntityName=N'Payments' AND EntityId IN (SELECT CONVERT(nvarchar(64),PaymentId) FROM dbo.Payments WHERE CustomerId IN (${cs})); DELETE FROM dbo.PaymentAllocations WHERE PaymentId IN (SELECT PaymentId FROM dbo.Payments WHERE CustomerId IN (${cs})); DELETE FROM dbo.Payments WHERE CustomerId IN (${cs}); DELETE FROM dbo.AuditLogs WHERE EntityName=N'Invoices' AND EntityId IN (SELECT CONVERT(nvarchar(64),InvoiceId) FROM dbo.Invoices WHERE CustomerId IN (${cs})); DELETE FROM dbo.Invoices WHERE CustomerId IN (${cs}); DELETE FROM dbo.AuditLogs WHERE EntityName=N'Customers' AND EntityId IN (SELECT CONVERT(nvarchar(64),CustomerId) FROM dbo.Customers WHERE CustomerId IN (${cs})); DELETE FROM dbo.Customers WHERE CustomerId IN (${cs});`)
})
async function role(browser:Browser,name='admin'){
  const context=await browser.newContext({storageState:{cookies:[],origins:[]}})
  const {page,token}=await login(context,accounts.find(a=>a.role===name)!)
  const api=await apiRequest.newContext({baseURL:'http://localhost:5173',extraHTTPHeaders:{Authorization:`Bearer ${token}`}})
  return{page,api,close:async()=>{await api.dispose();await context.close()}}
}
async function customer(api:APIRequestContext,suffix:string){const customerCode=prefix+suffix;codes.push(customerCode);const r=await api.post('/api/customers',{data:{customerCode,customerName:`Khách nhắc nợ ${suffix}`,phone:'0901234567',email:'fin05@example.com'}});expect(r.status()).toBe(201);return r.json()}
function day(base:string,offset:number){const d=new Date(`${base}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)}
async function today(api:APIRequestContext){return(await(await api.get('/api/reminders/candidates')).json()).asOfDate as string}
async function invoice(api:APIRequestContext,customerId:number,base:string,offset=0,issue=true){const r=await api.post('/api/invoices',{data:{customerId,invoiceDate:day(base,-30),dueDate:day(base,offset),items:[{description:'Dịch vụ',quantity:'1',unitPrice:'100.25'}]}});expect(r.status()).toBe(201);const i=await r.json();if(!issue)return i;const issued=await api.post(`/api/invoices/${i.invoiceId}/issue`,{data:{rowVersion:i.rowVersion}});expect(issued.status()).toBe(200);return issued.json()}
function body(i:{invoiceId:number;rowVersion:string},date:string){return{invoiceId:i.invoiceId,invoiceRowVersion:i.rowVersion,scheduledDate:date,content:'Vui lòng kiểm tra công nợ hóa đơn và phản hồi kế hoạch thanh toán.',contactChannel:'Phone',contactInfo:'0901234567'}}
async function create(api:APIRequestContext,i:{invoiceId:number;rowVersion:string},date:string){const r=await api.post('/api/reminders',{data:body(i,date)});expect(r.status()).toBe(201);return r.json()}
async function pay(api:APIRequestContext,customerId:number,i:{invoiceId:number;rowVersion:string},date:string,amount='100.25'){
  let r=await api.post('/api/payments',{data:{customerId,paymentDate:date,amount,paymentMethod:'Cash'}});expect(r.status()).toBe(201);let p=await r.json()
  r=await api.post(`/api/payments/${p.paymentId}/confirm`,{data:{rowVersion:p.rowVersion}});expect(r.status()).toBe(200);p=await r.json()
  r=await api.post(`/api/payments/${p.paymentId}/allocations`,{data:{rowVersion:p.rowVersion,items:[{invoiceId:i.invoiceId,rowVersion:i.rowVersion,amount}]}});expect(r.status()).toBe(200)
}

test('Hóa đơn cần nhắc: ranh giới hôm qua/hôm nay/7 ngày, loại nháp/hủy/đã trả, lọc và phân trang',async({browser})=>{
  const a=await role(browser)
  try{
    const c=await customer(a.api,'FILTER'),date=await today(a.api)
    for(const offset of [-1,0,7,8])await invoice(a.api,c.customerId,date,offset)
    await invoice(a.api,c.customerId,date,0,false)
    const cancelled=await invoice(a.api,c.customerId,date,0,false)
    expect((await a.api.post(`/api/invoices/${cancelled.invoiceId}/cancel`,{data:{rowVersion:cancelled.rowVersion}})).status()).toBe(200)
    const paid=await invoice(a.api,c.customerId,date,-1);await pay(a.api,c.customerId,paid,date)
    const path=`/api/reminders/candidates?search=${c.customerCode}`
    let list=await(await a.api.get(path)).json();expect(list.total).toBe(3);expect(list.upcomingDays).toBe(7)
    expect(list.items.map((i:{isOverdue:boolean})=>i.isOverdue)).toEqual([true,false,false])
    expect((await(await a.api.get(path+'&due=Overdue')).json()).total).toBe(1)
    expect((await(await a.api.get(path+'&due=Upcoming')).json()).total).toBe(2)
    list=await(await a.api.get(path+'&pageSize=1&page=2')).json();expect(list.total).toBe(3);expect(list.items).toHaveLength(1);expect(list.items[0].dueDate).toBe(date)
    expect((await a.api.get(path+'&due=Bad')).status()).toBe(400)
    expect((await a.api.get('/api/reminders?fromDate=2027-01-01&toDate=2026-01-01')).status()).toBe(400)
  }finally{await a.close()}
})

test('Nhắc nợ tạo/liên hệ/đóng, lưu người và thời gian, giữ lịch sử và cho tạo đợt mới',async({browser})=>{
  const a=await role(browser)
  try{
    const c=await customer(a.api,'FLOW'),date=await today(a.api),i=await invoice(a.api,c.customerId,date,-1)
    let r=await create(a.api,i,date);expect(r.balanceAtCreation).toBe('100.25');expect(r.status).toBe('Open');expect(r.reminderDate).toMatch(/Z$/)
    expect((await a.api.post('/api/reminders',{data:body(i,date)})).status()).toBe(409)
    const old=r.rowVersion
    let response=await a.api.post(`/api/reminders/${r.reminderId}/contact`,{data:{rowVersion:old,note:'Đã gọi; khách hẹn thanh toán ngày mai.'}})
    expect(response.status()).toBe(200);r=await response.json();expect(r.status).toBe('Contacted');expect(r.contactedAt).toMatch(/Z$/)
    expect((await a.api.post(`/api/reminders/${r.reminderId}/close`,{data:{rowVersion:old,note:'Bản cũ'}})).status()).toBe(409)
    expect((await a.api.post(`/api/reminders/${r.reminderId}/contact`,{data:{rowVersion:r.rowVersion,note:'Lặp'}})).status()).toBe(409)
    response=await a.api.post(`/api/reminders/${r.reminderId}/close`,{data:{rowVersion:r.rowVersion,note:'Kết thúc đợt liên hệ.'}});expect(response.status()).toBe(200);r=await response.json();expect(r.status).toBe('Closed');expect(r.closedAt).toMatch(/Z$/)
    expect((await a.api.post(`/api/reminders/${r.reminderId}/close`,{data:{rowVersion:r.rowVersion,note:'Lặp'}})).status()).toBe(409)
    const detail=await(await a.api.get(`/api/reminders/${r.reminderId}`)).json()
    expect(detail.history.map((h:{action:string})=>h.action)).toEqual(['Reminder.Create','Reminder.Contact','Reminder.Close'])
    const me=await(await a.api.get('/api/me')).json()
    expect(sql(`SELECT COUNT(*) FROM dbo.AuditLogs WHERE EntityName='DebtReminders' AND EntityId='${r.reminderId}' AND UserId=${me.appUserId};`)).toBe('3')
    await create(a.api,i,date)
    expect((await(await a.api.get(`/api/reminders?invoiceId=${i.invoiceId}&status=Closed&fromDate=${date}&toDate=${date}`)).json()).total).toBe(1)
  }finally{await a.close()}
})

test('Dữ liệu nhắc nợ không hợp lệ và hóa đơn chưa thuộc diện cần nhắc bị từ chối',async({browser})=>{
  const a=await role(browser)
  try{
    const c=await customer(a.api,'BAD'),date=await today(a.api),i=await invoice(a.api,c.customerId,date)
    for(const patch of [{content:''},{content:'   '},{contactInfo:''},{contactChannel:'SMS'},{contactChannel:'Email',contactInfo:'sai-email'},{scheduledDate:null},{scheduledDate:day(date,-1)},{scheduledDate:day(date,31)},{invoiceRowVersion:''}])expect((await a.api.post('/api/reminders',{data:{...body(i,date),...patch}})).status()).toBe(400)
    const future=await invoice(a.api,c.customerId,date,8),draft=await invoice(a.api,c.customerId,date,0,false)
    for(const item of [future,draft])expect((await a.api.post('/api/reminders',{data:body(item,date)})).status()).toBe(409)
    const r=await create(a.api,i,date)
    expect((await a.api.post(`/api/reminders/${r.reminderId}/contact`,{data:{rowVersion:r.rowVersion,note:' '}})).status()).toBe(400)
  }finally{await a.close()}
})

test('Kiểm tra lại số dư trước khi tạo/liên hệ, giữ lịch sử khi trả đủ, vẫn xử lý nợ khách ngừng hoạt động',async({browser})=>{
  const a=await role(browser)
  try{
    const c=await customer(a.api,'PAID'),date=await today(a.api),i=await invoice(a.api,c.customerId,date)
    await pay(a.api,c.customerId,i,date,'40.10')
    expect((await a.api.post('/api/reminders',{data:body(i,date)})).status()).toBe(409)
    const current=await(await a.api.get(`/api/invoices/${i.invoiceId}`)).json(),r=await create(a.api,current,date)
    expect(r.balanceAtCreation).toBe('60.15')
    expect((await a.api.patch(`/api/customers/${c.customerId}/status`,{data:{isActive:false,rowVersion:c.rowVersion}})).status()).toBe(200)
    expect((await a.api.post(`/api/reminders/${r.reminderId}/contact`,{data:{rowVersion:r.rowVersion,note:'Đã đối chiếu khoản nợ cũ.'}})).status()).toBe(200)
    // A different active customer can be paid after a reminder was created.
    const c2=await customer(a.api,'PAID2'),i2=await invoice(a.api,c2.customerId,date),r2=await create(a.api,i2,date)
    await pay(a.api,c2.customerId,i2,date)
    const detail=await(await a.api.get(`/api/reminders/${r2.reminderId}`)).json();expect(detail.detail.remainingAmount).toBe('0.00');expect(detail.detail.balanceAtCreation).toBe('100.25');expect(detail.detail.status).toBe('Open')
    expect((await a.api.post(`/api/reminders/${r2.reminderId}/contact`,{data:{rowVersion:r2.rowVersion,note:'Không nên nhắc nợ đã trả'}})).status()).toBe(409)
    expect((await a.api.post(`/api/reminders/${r2.reminderId}/close`,{data:{rowVersion:r2.rowVersion,note:'Khách đã thanh toán đủ.'}})).status()).toBe(200)
  }finally{await a.close()}
})

test('Yêu cầu đồng thời không tạo trùng hoặc ghi nhận liên hệ hai lần',async({browser})=>{
  const a=await role(browser)
  try{
    const c=await customer(a.api,'RACE'),date=await today(a.api),i=await invoice(a.api,c.customerId,date)
    const results=await Promise.all([1,2].map(()=>a.api.post('/api/reminders',{data:body(i,date)})))
    expect(results.map(r=>r.status()).sort()).toEqual([201,409])
    const r=await results.find(x=>x.status()===201)!.json()
    const contacts=await Promise.all([1,2].map(()=>a.api.post(`/api/reminders/${r.reminderId}/contact`,{data:{rowVersion:r.rowVersion,note:'Đã gọi xác nhận.'}})))
    expect(contacts.map(x=>x.status()).sort()).toEqual([200,409])
    const detail=await(await a.api.get(`/api/reminders/${r.reminderId}`)).json();expect(detail.history).toHaveLength(2)
  }finally{await a.close()}
})

test('Lỗi nhật ký hoàn tác tạo/liên hệ/đóng nhắc nợ, giữ nguyên phiên bản',async({browser})=>{
  const a=await role(browser),constraint=`CK_ReminderAudit_${Date.now()}`
  try{
    const c=await customer(a.api,'ROLL'),date=await today(a.api),i=await invoice(a.api,c.customerId,date)
    sql(`ALTER TABLE dbo.AuditLogs ADD CONSTRAINT [${constraint}] CHECK (NOT(EntityName=N'DebtReminders' AND Action=N'Reminder.Create' AND JSON_VALUE(Description,'$.After.InvoiceId')=N'${i.invoiceId}'));`)
    try{expect((await a.api.post('/api/reminders',{data:body(i,date)})).status()).toBe(500);expect((await(await a.api.get(`/api/reminders?invoiceId=${i.invoiceId}`)).json()).total).toBe(0)}finally{sql(`ALTER TABLE dbo.AuditLogs DROP CONSTRAINT [${constraint}];`)}
    const r=await create(a.api,i,date)
    for(const action of ['contact','close']){
      sql(`ALTER TABLE dbo.AuditLogs ADD CONSTRAINT [${constraint}] CHECK (NOT(EntityName=N'DebtReminders' AND EntityId=N'${r.reminderId}' AND Action<>N'Reminder.Create'));`)
      try{expect((await a.api.post(`/api/reminders/${r.reminderId}/${action}`,{data:{rowVersion:r.rowVersion,note:'Lỗi thử nghiệm'}})).status()).toBe(500);expect((await(await a.api.get(`/api/reminders/${r.reminderId}`)).json()).detail).toMatchObject({status:'Open',contactedAt:null,closedAt:null,rowVersion:r.rowVersion})}finally{sql(`ALTER TABLE dbo.AuditLogs DROP CONSTRAINT [${constraint}];`)}
    }
    expect((await a.api.post(`/api/reminders/${r.reminderId}/close`,{data:{rowVersion:r.rowVersion,note:'Kết thúc thử nghiệm'}})).status()).toBe(200)
  }finally{await a.close()}
})

test('Quyền nhắc nợ: kế toán/admin ghi, quản lý xem, kinh doanh/thu tiền bị chặn',async({browser})=>{
  const admin=await role(browser)
  try{
    const c=await customer(admin.api,'ROLES'),date=await today(admin.api),i=await invoice(admin.api,c.customerId,date)
    for(const name of ['accountant','manager','sales','cashier']){
      const a=await role(browser,name)
      try{
        const allowed=['accountant','manager'].includes(name)
        expect((await a.api.get('/api/reminders/candidates')).status()).toBe(allowed?200:403)
        expect((await a.api.get('/api/reminders')).status()).toBe(allowed?200:403)
        const response=await a.api.post('/api/reminders',{data:body(i,date)})
        expect(response.status()).toBe(name==='accountant'?201:403)
        if(name==='manager'){
          const r=(await(await admin.api.get(`/api/reminders?invoiceId=${i.invoiceId}`)).json()).items[0]
          const detail=(await(await a.api.get(`/api/reminders/${r.reminderId}`)).json()).detail
          for(const action of ['contact','close'])expect((await a.api.post(`/api/reminders/${r.reminderId}/${action}`,{data:{rowVersion:detail.rowVersion,note:'Không có quyền'}})).status()).toBe(403)
          await a.page.goto('/reminders');await a.page.getByLabel('Tìm nhắc nợ',{exact:true}).fill(c.customerCode);await a.page.getByRole('button',{name:'Tìm kiếm',exact:true}).click()
          await expect(a.page.getByRole('button',{name:/Đang xử lý/})).toBeVisible();await expect(a.page.getByRole('button',{name:/Lập nhắc nợ/})).toHaveCount(0)
        }
      }finally{await a.close()}
    }
    const anon=await apiRequest.newContext({baseURL:'http://localhost:5173'});expect((await anon.get('/api/reminders')).status()).toBe(401);await anon.dispose()
  }finally{await admin.close()}
})

test('Giao diện nhắc nợ: kiểm tra trước lưu, ghi nhận liên hệ, đóng và lịch sử trên điện thoại',async({browser})=>{
  const a=await role(browser)
  try{
    const c=await customer(a.api,'UI'),date=await today(a.api),i=await invoice(a.api,c.customerId,date,-1)
    await a.page.goto('/reminders');await a.page.getByLabel('Tìm nhắc nợ',{exact:true}).fill(c.customerCode);await a.page.getByRole('button',{name:'Tìm kiếm',exact:true}).click()
    await expect(a.page.getByRole('table')).toContainText('Quá hạn 1 ngày')
    await a.page.getByRole('button',{name:`Lập nhắc nợ ${i.invoiceNumber}`,exact:true}).click()
    await a.page.getByRole('button',{name:'Kiểm tra nhắc nợ',exact:true}).click()
    await a.page.getByRole('button',{name:'Quay lại chỉnh',exact:true}).click()
    await a.page.getByRole('textbox',{name:'Nội dung nhắc nợ',exact:true}).fill('Đề nghị kiểm tra và phản hồi khoản công nợ còn lại.')
    await a.page.getByRole('button',{name:'Kiểm tra nhắc nợ',exact:true}).click()
    await a.page.screenshot({path:'test-results/reminder-create-review.png',fullPage:true})
    await a.page.getByRole('button',{name:'Xác nhận tạo nhắc nợ',exact:true}).click()
    await a.page.getByRole('button',{name:'Ghi nhận đã liên hệ',exact:true}).click()
    await a.page.getByLabel('Kết quả liên hệ *',{exact:true}).fill('Đã gọi; khách xác nhận sẽ đối chiếu trong ngày.')
    await a.page.getByRole('button',{name:'Xác nhận đã liên hệ',exact:true}).click()
    await expect(a.page.getByRole('dialog').getByRole('status')).toContainText('Đã ghi nhận kết quả liên hệ')
    await a.page.getByRole('button',{name:'Đóng thông báo',exact:true}).click()
    await a.page.getByLabel('Lý do đóng *',{exact:true}).fill('Kết thúc đợt liên hệ, theo dõi kế hoạch thanh toán.')
    await a.page.getByRole('button',{name:'Xác nhận đóng thông báo',exact:true}).click()
    await expect(a.page.getByRole('dialog').getByText('Đã đóng',{exact:true})).toBeVisible()
    await expect(a.page.locator('.reminder-history li')).toHaveCount(3)
    await a.page.screenshot({path:'test-results/reminder-closed.png',fullPage:true})
    await a.page.setViewportSize({width:390,height:844});await a.page.screenshot({path:'test-results/reminder-detail-mobile.png',fullPage:true})
    await a.page.locator('.reminder-history li').last().scrollIntoViewIfNeeded()
    await expect(a.page.locator('.reminder-history li').last()).toBeVisible()
    await a.page.screenshot({path:'test-results/reminder-history-mobile.png',fullPage:true})
    await a.page.getByRole('button',{name:'Đóng chi tiết nhắc nợ',exact:true}).click()
    await a.page.getByRole('button',{name:'Lịch sử nhắc nợ',exact:true}).click()
    await a.page.getByLabel('Trạng thái nhắc nợ',{exact:true}).selectOption('Closed')
    await expect(a.page.getByRole('table')).toContainText('Đã đóng')
    await a.page.screenshot({path:'test-results/reminders-mobile.png',fullPage:true})
    expect(await a.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  }finally{await a.close()}
})
