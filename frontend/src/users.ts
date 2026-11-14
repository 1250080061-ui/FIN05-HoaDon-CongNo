export const businessRoles = ['admin', 'sales', 'accountant', 'cashier', 'manager'] as const
export const userRoleName = (role: string) => ({ admin: 'Quản trị viên', sales: 'Kinh doanh', accountant: 'Kế toán công nợ', cashier: 'Thu tiền', manager: 'Ban quản lý' }[role] ?? role)
export type ManagedUser = { userId: number; subject: string; username: string | null; fullName: string; email: string | null;
  isActive: boolean; adminSyncPending: boolean; roles: string[]; rolesManaged: boolean; rowVersion: string; createdAt: string; lastAdminUpdate: string | null }
export type KcPerson = { subject: string; username: string; firstName: string; lastName: string; email: string; enabled: boolean; roles: string[]; localUserId: number | null; requiredActions: string[] }
export type UserProfile = { firstName: string; lastName: string; email: string; enabled: boolean; roles: string[] }
export type UserOperation = { operationId: number; targetUserId: number | null; targetSubject: string | null; targetUsername: string;
  kind: string; status: string; startedAt: string; completedAt: string | null; lastError: string | null; rowVersion: string; desired: UserProfile }
export type ManagedUserDetail = { local: ManagedUser; keycloak: KcPerson; isSelf: boolean;
  operations: { operationId: number; kind: string; status: string; startedAt: string; completedAt: string | null; lastError: string | null; actorName: string }[] }
export type UserResult = { user: ManagedUser; operation: UserOperation }
export const operationStatus = (status: string) => ({ Pending: 'Đang chờ hoàn tất', Completed: 'Đã hoàn tất', Failed: 'Chưa hoàn tất' }[status] ?? status)
