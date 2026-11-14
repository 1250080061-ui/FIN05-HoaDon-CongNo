import { authorizationHeader } from './auth'

export type Customer = {
  customerId: number
  customerCode: string
  customerName: string
  taxCode: string | null
  phone: string | null
  email: string | null
  address: string | null
  isActive: boolean
  createdAt: string
  rowVersion: string
}
export type CustomerPage = { items: Customer[]; total: number; page: number; pageSize: number }
type Problem = { title?: string; errors?: Record<string, string[]> }
export class ApiError extends Error {
  errors: Record<string, string[]>
  constructor(message: string, errors: Record<string, string[]> = {}) {
    super(message)
    this.errors = errors
  }
}
export async function apiResponse(path: string, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers)
  headers.set('Authorization', await authorizationHeader())
  const response = await fetch(`/api${path}`, { ...options, headers })
  if (!response.ok) {
    if (response.status === 401) throw new ApiError('Phiên đăng nhập không còn hợp lệ. Vui lòng đăng xuất và đăng nhập lại.')
    if (response.status === 403) throw new ApiError('Tài khoản của bạn không có quyền thực hiện thao tác này.')
    const problem: Problem = await response.json().catch(() => ({}))
    const fallback = response.status >= 500
      ? 'Chưa kết nối được máy chủ. Vui lòng kiểm tra Backend và thử lại.'
      : 'Không thể thực hiện yêu cầu. Vui lòng thử lại.'
    throw new ApiError(response.status === 400 && problem.errors ? 'Vui lòng kiểm tra thông tin đã nhập.' : problem.title || fallback, problem.errors)
  }
  return response
}
export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return (await apiResponse(path, options)).json() as Promise<T>
}
