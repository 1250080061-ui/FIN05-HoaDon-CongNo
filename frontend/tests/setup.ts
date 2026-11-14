import { request } from '@playwright/test'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

export default async function setup() {
  const credentials = JSON.parse(readFileSync(new URL('../../.local/dev-accounts.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''))
  const api = await request.newContext()
  const tokenResponse = await api.post('http://localhost:8080/realms/master/protocol/openid-connect/token', {
    form: { client_id: 'admin-cli', grant_type: 'password', username: credentials.bootstrapAdmin, password: credentials.bootstrapPassword },
  })
  if (!tokenResponse.ok()) throw new Error('Không đăng nhập được quản trị Keycloak để chuẩn bị tài khoản kiểm thử.')
  const token = (await tokenResponse.json()).access_token
  const admin = await request.newContext({ baseURL: 'http://localhost:8080/admin/realms/fin05/', extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
  const path = new URL('../../.local/test-accounts.json', import.meta.url)
  type Account = { username: string; password: string; role: string; keycloakSubject?: string }
  const accounts: Account[] = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8')).accounts
    : ['admin', 'sales', 'accountant', 'cashier', 'manager'].map(role => ({ username: `fin05_test_${role}_${randomBytes(3).toString('hex')}`, role, password: randomBytes(24).toString('base64url') }))
  try {
    const client = (await (await admin.get('clients?clientId=account')).json())[0]
    const accountRoles = await Promise.all(['manage-account', 'view-profile'].map(async name => (await admin.get(`clients/${client.id}/roles/${name}`)).json()))
    for (const account of accounts) {
      if (account.keycloakSubject && (await admin.get(`users/${account.keycloakSubject}`)).ok()) continue
      const result = await admin.post('users', { data: {
        username: account.username, enabled: true, emailVerified: true, email: `${account.username}@example.com`,
        firstName: 'Kiểm thử', lastName: account.role,
        credentials: [{ type: 'password', value: account.password, temporary: false }],
      } })
      if (result.status() !== 201) throw new Error(`Không tạo được tài khoản kiểm thử ${account.role}.`)
      account.keycloakSubject = result.headers().location.split('/').pop()!
      const role = await (await admin.get(`roles/${account.role}`)).json()
      if (!(await admin.post(`users/${account.keycloakSubject}/role-mappings/realm`, { data: [role] })).ok()) throw new Error('Không gán được vai trò kiểm thử.')
      if (!(await admin.post(`users/${account.keycloakSubject}/role-mappings/clients/${client.id}`, { data: accountRoles })).ok()) throw new Error('Không gán được quyền quản lý tài khoản thử.')
      writeFileSync(path, JSON.stringify({ accounts }, null, 2))
    }
  } finally { await admin.dispose(); await api.dispose() }
}
