import { test, expect, login, accounts } from './fixtures'
import { request as apiRequest } from '@playwright/test'
import type { Browser, APIRequestContext } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const prefix=`ua_${Date.now()}_`,names:string[]=[]
function sql(command:string){return execFileSync('sqlcmd.exe',['-S','localhost','-E','-C','-d','FIN05','-I','-b','-h','-1','-W','-Q',`SET NOCOUNT ON; ${command}`],{encoding:'utf8'}).trim()}
async function kc(){const creds=JSON.parse(readFileSync(new URL('../../.local/dev-accounts.json',import.meta.url),'utf8').replace(/^\uFEFF/,'')),api=await apiRequest.newContext();const r=await api.post('http://localhost:8080/realms/master/protocol/openid-connect/token',{form:{client_id:'admin-cli',grant_type:'password',username:creds.bootstrapAdmin,password:creds.bootstrapPassword}});if(!r.ok())throw new Error('Không chuẩn bị được tài khoản thử quản trị');const token=(await r.json()).access_token;await api.dispose();return apiRequest.newContext({baseURL:'http://localhost:8080/admin/realms/fin05/',extraHTTPHeaders:{Authorization:`Bearer ${token}`}})}
test.afterAll(async()=>{
  if(!names.length)return
  if(!names.every(n=>/^ua_\d+_[a-z0-9]+$/.test(n)))throw new Error('Unsafe cleanup')
  const admin=await kc()
  try{for(const name of names){const users=await(await admin.get(`users?username=${name}&exact=true`)).json();for(const u of users)expect([204,404]).toContain((await admin.delete(`users/${u.id}`)).status())}}finally{await admin.dispose()}
  const list=names.map(n=>`'${n}'`).join(','),ids=`SELECT UserId FROM dbo.AppUsers WHERE Username IN (${list})`,ops=`SELECT OperationId FROM dbo.UserAdminOperations WHERE TargetUsername IN (${list})`
  sql(`DELETE FROM dbo.AuditLogs WHERE EntityName='UserAdministration' AND ((Action='User.Link' AND EntityId IN (SELECT CONVERT(nvarchar(64),UserId) FROM dbo.AppUsers WHERE Username IN (${list}))) OR (Action<>'User.Link' AND EntityId IN (SELECT CONVERT(nvarchar(64),OperationId) FROM dbo.UserAdminOperations WHERE TargetUsername IN (${list})))); DELETE FROM dbo.UserAdminOperations WHERE OperationId IN (${ops}); DELETE FROM dbo.AppUsers WHERE UserId IN (${ids});`)
})
async function role(browser:Browser,name='admin'){
  const context=await browser.newContext({storageState:{cookies:[],origins:[]}}),{page,token}=await login(context,accounts.find(a=>a.role===name)!)
  const api=await apiRequest.newContext({baseURL:'http://localhost:5173',extraHTTPHeaders:{Authorization:`Bearer ${token}`}})
  return{page,api,close:async()=>{await api.dispose();await context.close()}}
}
function input(suffix:string,roles=['sales']){const username=prefix+suffix;names.push(username);return{username,firstName:'Người thử',lastName:suffix,email:`${username}@example.com`,enabled:true,roles,initialPassword:randomBytes(24).toString('base64url')}}
async function create(api:APIRequestContext,suffix:string,roles=['sales']){const data=input(suffix,roles),r=await api.post('/api/users',{data});expect(r.status()).toBe(200);return{data,result:await r.json()}}
async function detail(api:APIRequestContext,id:number){const r=await api.get(`/api/users/${id}`);expect(r.status()).toBe(200);return r.json()}
function updateBody(d:{local:{rowVersion:string};keycloak:{firstName:string;lastName:string;email:string;enabled:boolean;roles:string[]}},change:Record<string,unknown>={}){return{firstName:d.keycloak.firstName,lastName:d.keycloak.lastName,email:d.keycloak.email,enabled:d.keycloak.enabled,roles:d.keycloak.roles,rowVersion:d.local.rowVersion,...change}}
async function firstLogin(browser:Browser,data:{username:string;initialPassword:string}){
  const context=await browser.newContext({storageState:{cookies:[],origins:[]}}),page=await context.newPage(),password=randomBytes(24).toString('base64url')
  await page.goto('http://localhost:5173');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.locator('#username').fill(data.username);await page.locator('#password').fill(data.initialPassword);await page.locator('#kc-login').click();await expect(page.locator('#password-new')).toBeVisible();await page.locator('#password-new').fill(password);await page.locator('#password-confirm').fill(password)
  const tokenResponse=page.waitForResponse(r=>r.url().includes('/protocol/openid-connect/token')&&r.request().method()==='POST');await page.locator('#kc-passwd-update-form [type=submit]').click();const token=(await(await tokenResponse).json()).access_token as string;await expect(page.getByRole('heading',{name:'Khách hàng',exact:true})).toBeVisible()
  const api=await apiRequest.newContext({baseURL:'http://localhost:5173',extraHTTPHeaders:{Authorization:`Bearer ${token}`}})
  return{context,page,api,password,close:async()=>{await api.dispose();await context.close()}}
}

test('Tạo tài khoản Keycloak, mật khẩu tạm bắt buộc đổi, chỉ lưu định danh/hồ sơ/nhật ký không lưu mật khẩu',async({browser})=>{
  const admin=await role(browser)
  try{
    const {data,result}=await create(admin.api,'create');expect(result.user.roles).toEqual(['sales']);expect(result.user.adminSyncPending).toBe(false)
    const d=await detail(admin.api,result.user.userId);expect(d.keycloak.requiredActions).toContain('UPDATE_PASSWORD');expect(d.keycloak.enabled).toBe(true)
    const serialized=JSON.stringify(result)+sql(`SELECT DesiredJson FROM dbo.UserAdminOperations WHERE OperationId=${result.operation.operationId}; SELECT Description FROM dbo.AuditLogs WHERE EntityName='UserAdministration' AND EntityId='${result.operation.operationId}';`)
    expect(serialized.includes(data.initialPassword)).toBe(false);expect(serialized.toLowerCase().includes('initialpassword')).toBe(false)
    const user=await firstLogin(browser,data)
    try{expect((await user.api.get('/api/customers')).status()).toBe(200);expect((await user.api.get('/api/users')).status()).toBe(403)}finally{await user.close()}
  }finally{await admin.close()}
})

test('Tra cứu/liên kết tài khoản có sẵn, giữ mật khẩu và vai trò, không liên kết trùng/tài khoản kỹ thuật',async({browser})=>{
  const admin=await role(browser),external=await kc(),data=input('link')
  try{
    const r=await external.post('users',{data:{username:data.username,firstName:data.firstName,lastName:data.lastName,email:data.email,enabled:true,emailVerified:true,credentials:[{type:'password',value:data.initialPassword,temporary:false}]}});expect(r.status()).toBe(201);const subject=r.headers().location.split('/').pop()!
    const sales=await(await external.get('roles/sales')).json();expect((await external.post(`users/${subject}/role-mappings/realm`,{data:[sales]})).status()).toBe(204)
    const lookup=await(await admin.api.get(`/api/users/lookup?username=${data.username}`)).json();expect(lookup.localUserId).toBeNull();expect(lookup.roles).toEqual(['sales'])
    const linked=await admin.api.post('/api/users/link',{data:{subject}});expect(linked.status()).toBe(200);const local=await linked.json();expect(local.subject).toBe(subject)
    expect((await admin.api.post('/api/users/link',{data:{subject}})).status()).toBe(409)
    expect((await admin.api.get('/api/users/lookup?username=service-account-fin05-user-admin')).status()).toBe(404)
    const ctx=await browser.newContext({storageState:{cookies:[],origins:[]}})
    try{const logged=await login(ctx,{username:data.username,password:data.initialPassword,role:'sales'});expect(logged.token.length).toBeGreaterThan(100)}finally{await ctx.close()}
  }finally{await external.dispose();await admin.close()}
})

test('Thu hồi quyền chặn token cũ ngay, hồ sơ không bị ghi đè, khóa/mở và không đặt lại mật khẩu',async({browser})=>{
  const admin=await role(browser)
  try{
    const {data,result}=await create(admin.api,'access'),user=await firstLogin(browser,data)
    try{
      expect((await user.api.post('/api/customers',{data:{}})).status()).toBe(400)
      let d=await detail(admin.api,result.user.userId)
      let r=await admin.api.put(`/api/users/${result.user.userId}`,{data:updateBody(d,{roles:['manager'],firstName:'Hồ sơ mới'})});expect(r.status()).toBe(200)
      expect((await user.api.post('/api/customers',{data:{}})).status()).toBe(403);expect((await user.api.get('/api/reports')).status()).toBe(403)
      d=await detail(admin.api,result.user.userId);expect(d.local.fullName).toBe('Hồ sơ mới access');expect(d.keycloak.roles).toEqual(['manager'])
      const fresh=await browser.newContext({storageState:{cookies:[],origins:[]}})
      try{
        const authenticated=await login(fresh,{username:data.username,password:user.password,role:'manager'}),api=await apiRequest.newContext({baseURL:'http://localhost:5173',extraHTTPHeaders:{Authorization:`Bearer ${authenticated.token}`}})
        try{
          expect((await api.get('/api/reports')).status()).toBe(200)
          d=await detail(admin.api,result.user.userId);r=await admin.api.put(`/api/users/${result.user.userId}`,{data:updateBody(d,{enabled:false})});expect(r.status()).toBe(200)
          const locked=await r.json()
          expect(sql(`SELECT JSON_VALUE(Description,'$.Before.IsActive') FROM dbo.AuditLogs WHERE EntityName='UserAdministration' AND Action='User.ChangeRequested' AND EntityId='${locked.operation.operationId}';`)).toBe('true')
          expect((await api.get('/api/me')).status()).toBe(403)
          d=await detail(admin.api,result.user.userId);expect(d.keycloak.enabled).toBe(false);r=await admin.api.put(`/api/users/${result.user.userId}`,{data:updateBody(d,{enabled:true})});expect(r.status()).toBe(200)
        }finally{await api.dispose()}
      }finally{await fresh.close()}
      const again=await browser.newContext({storageState:{cookies:[],origins:[]}})
      try{await login(again,{username:data.username,password:user.password,role:'manager'})}finally{await again.close()}
    }finally{await user.close()}
  }finally{await admin.close()}
})

test('Chặn tự khóa/tự thu hồi, vai trò ngoài FIN05, dữ liệu sai và ghi đè đồng thời',async({browser})=>{
  const admin=await role(browser)
  try{
    const me=await(await admin.api.get('/api/me')).json(),self=await detail(admin.api,me.appUserId)
    expect((await admin.api.put(`/api/users/${me.appUserId}`,{data:updateBody(self,{enabled:false,roles:['sales']})})).status()).toBe(400)
    const data=input('invalid')
    for(const patch of [{roles:['realm-admin']},{roles:['admin','admin']},{roles:[]},{username:'bad user'},{email:'bad'},{initialPassword:'short'},{firstName:' '}])expect((await admin.api.post('/api/users',{data:{...data,...patch}})).status()).toBe(400)
    const {data:created,result}=await create(admin.api,'race'),d=await detail(admin.api,result.user.userId)
    expect((await admin.api.post('/api/users',{data:created})).status()).toBe(409)
    const responses=await Promise.all([1,2].map(n=>admin.api.put(`/api/users/${result.user.userId}`,{data:updateBody(d,{lastName:`race${n}`})})))
    expect(responses.map(r=>r.status()).sort()).toEqual([200,409])
  }finally{await admin.close()}
})

test('Lỗi nhật ký trước/sau Keycloak không báo hoàn tác giả; chặn người đích và thử lại an toàn',async({browser})=>{
  const admin=await role(browser),constraint=`CK_UserAdminAudit_${Date.now()}`
  try{
    const {data,result}=await create(admin.api,'rollback'),user=await firstLogin(browser,data)
    try{
      let d=await detail(admin.api,result.user.userId)
      const floor=Number(sql('SELECT MAX(AuditLogId) FROM dbo.AuditLogs;'))
      sql(`ALTER TABLE dbo.AuditLogs ADD CONSTRAINT [${constraint}] CHECK (NOT(AuditLogId>${floor} AND EntityName='UserAdministration' AND Action='User.ChangeRequested' AND CHARINDEX('${data.username}',Description)>0));`)
      try{expect((await admin.api.put(`/api/users/${result.user.userId}`,{data:updateBody(d,{roles:['manager']})})).status()).toBe(500)}finally{sql(`ALTER TABLE dbo.AuditLogs DROP CONSTRAINT [${constraint}];`)}
      d=await detail(admin.api,result.user.userId);expect(d.keycloak.roles).toEqual(['sales']);expect(d.local.adminSyncPending).toBe(false)
      sql(`ALTER TABLE dbo.AuditLogs ADD CONSTRAINT [${constraint}] CHECK (NOT(AuditLogId>${floor} AND EntityName='UserAdministration' AND Action='User.ChangeCompleted' AND CHARINDEX('${data.username}',Description)>0));`)
      try{expect((await admin.api.put(`/api/users/${result.user.userId}`,{data:updateBody(d,{roles:['manager']})})).status()).toBe(503)}finally{sql(`ALTER TABLE dbo.AuditLogs DROP CONSTRAINT [${constraint}];`)}
      d=await detail(admin.api,result.user.userId);expect(d.keycloak.roles).toEqual(['manager']);expect(d.local.adminSyncPending).toBe(true);expect((await user.api.get('/api/me')).status()).toBe(403)
      const operations=await(await admin.api.get('/api/users/operations')).json(),operation=operations.find((o:{targetUserId:number})=>o.targetUserId===result.user.userId)
      expect(operation.status).toBe('Failed');expect(operation.desired.roles).toEqual(['manager'])
      await admin.page.goto('/users');await admin.page.getByRole('button',{name:`Kiểm tra thử lại #${operation.operationId}`,exact:true}).click()
      await expect(admin.page.getByRole('heading',{name:`Đồng bộ lại tác vụ #${operation.operationId}`,exact:true})).toBeVisible()
      await admin.page.screenshot({path:'test-results/user-retry-review.png',fullPage:true})
      const retryResponse=admin.page.waitForResponse(r=>r.url().endsWith(`/users/operations/${operation.operationId}/retry`)&&r.request().method()==='POST')
      await admin.page.getByRole('button',{name:'Xác nhận đồng bộ lại',exact:true}).click();expect((await retryResponse).status()).toBe(200)
      await expect(admin.page.getByText('Đã hoàn tất tác vụ đồng bộ lại.',{exact:true})).toBeVisible()
      d=await detail(admin.api,result.user.userId);expect(d.local.adminSyncPending).toBe(false);expect(d.local.roles).toEqual(['manager']);expect(d.keycloak.requiredActions).not.toContain('UPDATE_PASSWORD')
    }finally{await user.close()}
  }finally{await admin.close()}
})

test('Chỉ admin truy cập mọi API quản trị và nút điều hướng',async({browser})=>{
  for(const name of ['sales','accountant','cashier','manager']){
    const x=await role(browser,name)
    try{
      for(const path of ['/api/users','/api/users/operations','/api/users/lookup?username=admin01','/api/users/1'])expect((await x.api.get(path)).status()).toBe(403)
      expect((await x.api.post('/api/users',{data:{}})).status()).toBe(403);expect((await x.api.put('/api/users/1',{data:{}})).status()).toBe(403);expect((await x.api.post('/api/users/link',{data:{}})).status()).toBe(403);expect((await x.api.post('/api/users/operations/1/retry',{data:{}})).status()).toBe(403)
      await expect(x.page.getByRole('link',{name:'Người dùng',exact:true})).toHaveCount(0)
    }finally{await x.close()}
  }
  const anon=await apiRequest.newContext({baseURL:'http://localhost:5173'});expect((await anon.get('/api/users')).status()).toBe(401);await anon.dispose()
})

test('Tài khoản Keycloak mất liên kết được báo lỗi rõ, không âm thầm mở quyền nội bộ',async({browser})=>{
  const admin=await role(browser),external=await kc()
  try{
    const {result}=await create(admin.api,'missing'),d=await detail(admin.api,result.user.userId)
    expect((await external.delete(`users/${result.user.subject}`)).status()).toBe(204)
    expect((await admin.api.put(`/api/users/${result.user.userId}`,{data:updateBody(d,{enabled:false})})).status()).toBe(503)
    const operations=await(await admin.api.get('/api/users/operations')).json(),operation=operations.find((o:{targetUserId:number})=>o.targetUserId===result.user.userId)
    expect(operation.status).toBe('Failed');expect(sql(`SELECT CONVERT(int,AdminSyncPending) FROM dbo.AppUsers WHERE UserId=${result.user.userId};`)).toBe('1')
  }finally{await external.dispose();await admin.close()}
})

test('Hai quản trị viên đồng thời thu hồi nhau vẫn giữ một quản trị viên hoạt động',async({browser})=>{
  const admin=await role(browser)
  try{
    const a=await create(admin.api,'admina',['admin']),b=await create(admin.api,'adminb',['admin'])
    const first=await firstLogin(browser,a.data),second=await firstLogin(browser,b.data)
    try{
      const da=await detail(admin.api,a.result.user.userId),db=await detail(admin.api,b.result.user.userId)
      const results=await Promise.all([first.api.put(`/api/users/${b.result.user.userId}`,{data:updateBody(db,{roles:['manager']})}),second.api.put(`/api/users/${a.result.user.userId}`,{data:updateBody(da,{roles:['manager']})})])
      expect(results.map(r=>r.status()).sort()).toEqual([200,403])
      const finalA=await detail(admin.api,a.result.user.userId),finalB=await detail(admin.api,b.result.user.userId)
      expect([finalA,finalB].filter(d=>d.local.isActive&&d.local.roles.includes('admin'))).toHaveLength(1)
    }finally{await first.close();await second.close()}
  }finally{await admin.close()}
})

test('Giao diện tạo/xem/cập nhật có xác nhận và bố cục điện thoại',async({browser})=>{
  const admin=await role(browser),data=input('ui')
  try{
    await admin.page.goto('/users');await admin.page.getByRole('button',{name:'＋ Tạo tài khoản mới',exact:true}).click();await admin.page.locator('#user-username').fill(data.username);await admin.page.locator('#user-password').fill(data.initialPassword);await admin.page.locator('#user-first-name').fill(data.firstName);await admin.page.locator('#user-last-name').fill(data.lastName);await admin.page.locator('#user-email').fill(data.email)
    await admin.page.getByRole('button',{name:'Kiểm tra thay đổi',exact:true}).click();await admin.page.screenshot({path:'test-results/user-create-review.png',fullPage:true});await admin.page.getByRole('button',{name:'Xác nhận lưu người dùng',exact:true}).click()
    await expect(admin.page.getByRole('heading',{name:data.username,exact:true})).toBeVisible();await expect(admin.page.getByText('Cần đổi mật khẩu ở lần đăng nhập đầu.',{exact:true})).toBeVisible()
    await admin.page.getByRole('button',{name:'Cập nhật hồ sơ và quyền',exact:true}).click();await admin.page.getByRole('checkbox',{name:'Kinh doanh',exact:true}).uncheck();await admin.page.getByRole('checkbox',{name:'Ban quản lý',exact:true}).check();await admin.page.getByRole('checkbox',{name:'Cho phép truy cập FIN-05',exact:true}).uncheck();await admin.page.getByRole('button',{name:'Kiểm tra thay đổi',exact:true}).click();await admin.page.getByRole('button',{name:'Xác nhận lưu người dùng',exact:true}).click()
    await expect(admin.page.getByRole('dialog').getByText('Đã khóa',{exact:true})).toBeVisible();await admin.page.screenshot({path:'test-results/user-locked.png',fullPage:true});await admin.page.getByRole('button',{name:'Đóng chi tiết người dùng',exact:true}).click();await admin.page.getByLabel('Tìm người dùng',{exact:true}).fill(data.username);await admin.page.getByRole('button',{name:'Tìm kiếm',exact:true}).click();await expect(admin.page.getByRole('table')).toContainText('Đã khóa');await admin.page.setViewportSize({width:390,height:844});await admin.page.screenshot({path:'test-results/users-mobile.png',fullPage:true});expect(await admin.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  }finally{await admin.close()}
})
