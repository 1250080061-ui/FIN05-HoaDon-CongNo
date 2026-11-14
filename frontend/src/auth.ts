import Keycloak from 'keycloak-js'

export const keycloak = new Keycloak({
  url: 'http://localhost:8080', realm: 'fin05', clientId: 'fin05-web',
})
export const initializeAuth = () => keycloak.init({
  onLoad: 'check-sso', pkceMethod: 'S256', checkLoginIframe: false,
})
export const canWriteCustomers = () => keycloak.hasRealmRole('admin') || keycloak.hasRealmRole('sales')
export const canReadInvoices = () => ['admin', 'accountant', 'manager'].some(role => keycloak.hasRealmRole(role))
export const canWriteInvoices = () => keycloak.hasRealmRole('admin') || keycloak.hasRealmRole('accountant')
export const canReadPayments = () => ['admin', 'cashier', 'accountant', 'manager'].some(role => keycloak.hasRealmRole(role))
export const canWritePayments = () => keycloak.hasRealmRole('admin') || keycloak.hasRealmRole('cashier')
export const canAllocatePayments = () => keycloak.hasRealmRole('admin') || keycloak.hasRealmRole('accountant')
export const canReadReminders = () => ['admin', 'accountant', 'manager'].some(role => keycloak.hasRealmRole(role))
export const canWriteReminders = () => keycloak.hasRealmRole('admin') || keycloak.hasRealmRole('accountant')
export const canReadAdjustments = () => ['admin', 'accountant', 'manager'].some(role => keycloak.hasRealmRole(role))
export const canWriteAdjustments = () => keycloak.hasRealmRole('admin') || keycloak.hasRealmRole('accountant')
export const canReadReports = () => ['admin', 'accountant', 'manager'].some(role => keycloak.hasRealmRole(role))
export const canAdminUsers = () => keycloak.hasRealmRole('admin')
export const username = () => keycloak.tokenParsed?.name || keycloak.tokenParsed?.preferred_username || 'Người dùng'
export async function authorizationHeader() {
  await keycloak.updateToken(30)
  if (!keycloak.token) throw new Error('Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.')
  return `Bearer ${keycloak.token}`
}
keycloak.onTokenExpired = () => {
  keycloak.updateToken(30).catch(() => { keycloak.clearToken(); window.location.reload() })
}
