import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { request } from './api'
import { canAdminUsers } from './auth'
import { Workspace } from './Workspace'
import { UserEditor } from './UserEditor'
import { UserDetails } from './UserDetails'
import { businessRoles, operationStatus, userRoleName } from './users'
import type { KcPerson, ManagedUser, ManagedUserDetail, UserOperation } from './users'

export function UsersPage() {
  return <Workspace section="users">{canAdminUsers() ? <Users /> : <div className="empty-state"><h1>Không có quyền quản lý người dùng</h1><p>Chức năng chỉ dành cho quản trị viên.</p><a href="/">Về khách hàng</a></div>}</Workspace>
}
function Users() {
  const [query, setQuery] = useState({ search: '', role: '', active: '', page: 1, revision: 0 })
  const [term, setTerm] = useState('')
  const [data, setData] = useState<{ items: ManagedUser[]; total: number; currentUserId: number } | null>(null)
  const [operations, setOperations] = useState<UserOperation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [detailId, setDetailId] = useState<number | null>(null)
  const [editor, setEditor] = useState<ManagedUserDetail | 'new' | null>(null)
  const [lookup, setLookup] = useState('')
  const [found, setFound] = useState<KcPerson | null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [confirmLink, setConfirmLink] = useState(false)
  const [retry, setRetry] = useState<UserOperation | null>(null)
  useEffect(() => {
    const controller = new AbortController(), params = new URLSearchParams({ search: query.search, page: String(query.page), pageSize: '10' })
    if (query.role) params.set('role', query.role)
    if (query.active) params.set('isActive', query.active)
    Promise.all([request<{ items: ManagedUser[]; total: number; currentUserId: number }>(`/users?${params}`, { signal: controller.signal }), request<UserOperation[]>('/users/operations', { signal: controller.signal })])
      .then(([page, ops]) => { setData(page); setOperations(ops); setError('') })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Không tải được người dùng.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query])
  function reload(change: Partial<typeof query> = {}) { setLoading(true); setError(''); setQuery(c => ({ ...c, ...change, revision: c.revision + 1 })) }
  async function find(e: FormEvent) {
    e.preventDefault(); if (lookupBusy) return
    setLookupBusy(true); setFound(null); setLookupError(''); setConfirmLink(false)
    try { setFound(await request<KcPerson>(`/users/lookup?username=${encodeURIComponent(lookup.trim())}`)) }
    catch (e) { setLookupError(e instanceof Error ? e.message : 'Không tra cứu được Keycloak.') }
    finally { setLookupBusy(false) }
  }
  async function link() {
    if (!found || lookupBusy) return
    setLookupBusy(true); setLookupError('')
    try {
      const u = await request<ManagedUser>('/users/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: found.subject }) })
      setFound(c => c ? { ...c, localUserId: u.userId } : null); setConfirmLink(false); setNotice('Đã liên kết tài khoản Keycloak hiện có; giữ nguyên mật khẩu và vai trò.'); reload(); setDetailId(u.userId)
    } catch (e) { setLookupError(e instanceof Error ? e.message : 'Chưa hoàn tất liên kết. Hãy tra cứu lại trước khi thử lại.') }
    finally { setLookupBusy(false) }
  }
  return <><div className="breadcrumb">Quản trị <span>/</span><strong>Người dùng</strong></div><div className="page-heading"><div><div className="eyebrow">TÀI KHOẢN & PHÂN QUYỀN</div><h1>Quản lý người dùng</h1><p>Liên kết danh tính Keycloak và kiểm soát truy cập các nghiệp vụ FIN-05.</p></div><button className="primary" onClick={() => setEditor('new')}>＋ Tạo tài khoản mới</button></div>
    {notice && <div role="status" className="notice success">{notice}</div>}
    <details className="user-lookup-panel"><summary>Tra cứu và liên kết tài khoản Keycloak đã có</summary><form onSubmit={find}><label className="sr-only" htmlFor="user-lookup">Tên đăng nhập Keycloak chính xác</label><input id="user-lookup" required maxLength={150} value={lookup} onChange={e => setLookup(e.target.value)} placeholder="Nhập tên đăng nhập chính xác" /><button className="secondary" disabled={lookupBusy} type="submit">{lookupBusy ? 'Đang tra cứu…' : 'Tra cứu Keycloak'}</button></form>{lookupError && <div role="alert" className="notice error">{lookupError}</div>}{found && <div className="user-lookup-result"><h3>{found.username}</h3><p>{found.firstName} {found.lastName} · {found.email}</p><p>Keycloak: {found.enabled ? 'Được bật' : 'Đã tắt'} · {found.roles.map(userRoleName).join(', ') || 'Chưa có vai trò nghiệp vụ'}</p>{found.localUserId ? <button className="secondary" onClick={() => setDetailId(found.localUserId)}>Mở tài khoản đã liên kết</button> : confirmLink ? <div className="payment-confirm"><p>Liên kết tài khoản này với FIN-05? Giữ nguyên mật khẩu, vai trò và trạng thái Keycloak.</p><button className="secondary" disabled={lookupBusy} onClick={() => setConfirmLink(false)}>Quay lại</button><button className="primary" disabled={lookupBusy} onClick={() => void link()}>Xác nhận liên kết</button></div> : <button className="primary" onClick={() => setConfirmLink(true)}>Liên kết tài khoản này</button>}</div>}</details>
    {!loading && !error && operations.length > 0 && <section className="user-operations" aria-labelledby="user-operations-title"><h2 id="user-operations-title">Tác vụ chưa hoàn tất</h2><p>Tài khoản đang chờ đồng bộ bị chặn truy cập FIN-05. Đối chiếu yêu cầu trước khi thử lại.</p>{operations.map(o => <div key={o.operationId}><span><strong>#{o.operationId} · {o.targetUsername}</strong><span className="subtext">{operationStatus(o.status)} · {new Date(o.startedAt).toLocaleString('vi-VN')}</span><span className="subtext">{o.lastError}</span></span>{o.targetUserId && o.targetSubject ? <button className="secondary" onClick={() => setRetry(o)}>Kiểm tra thử lại #{o.operationId}</button> : <span className="subtext">Chưa xác định đủ liên kết; tra cứu tên đăng nhập trên Keycloak để đối chiếu.</span>}</div>)}</section>}
    <section className="customer-panel" aria-labelledby="users-list-title"><div className="panel-heading"><h2 id="users-list-title">Người dùng đã liên kết</h2><span className="panel-caption">Vai trò đã đồng bộ hoặc ghi nhận từ lần đăng nhập</span></div><div className="toolbar"><form role="search" onSubmit={e => { e.preventDefault(); reload({ search: term.trim(), page: 1 }) }}><div className="search-input"><span aria-hidden="true">⌕</span><label className="sr-only" htmlFor="users-search">Tìm người dùng</label><input id="users-search" value={term} maxLength={150} onChange={e => setTerm(e.target.value)} placeholder="Tên đăng nhập, họ tên hoặc email" /></div><label className="sr-only" htmlFor="users-role-filter">Lọc vai trò người dùng</label><select id="users-role-filter" value={query.role} onChange={e => reload({ role: e.target.value, page: 1 })}><option value="">Tất cả vai trò</option>{businessRoles.map(r => <option key={r} value={r}>{userRoleName(r)}</option>)}</select><label className="sr-only" htmlFor="users-active-filter">Lọc truy cập người dùng</label><select id="users-active-filter" value={query.active} onChange={e => reload({ active: e.target.value, page: 1 })}><option value="">Tất cả truy cập</option><option value="true">Cho phép</option><option value="false">Đã khóa</option></select><button className="secondary" type="submit">Tìm kiếm</button></form><button className="text-button" disabled={loading} onClick={() => reload()}>↻ Tải lại</button></div>
    {error ? <div role="alert" className="empty-state"><p>{error}</p><button className="secondary" onClick={() => reload()}>Thử lại</button></div> : loading ? <div role="status" className="empty-state"><div className="spinner" /><p>Đang tải người dùng…</p></div> : data?.items.length ? <div className="table-scroll"><table><thead><tr><th>Tài khoản</th><th>Họ tên / Email</th><th>Vai trò nghiệp vụ</th><th>Truy cập</th><th /></tr></thead><tbody>{data.items.map(u => <tr key={u.userId}><td><span className="customer-code">{u.username ?? `#${u.userId}`}</span>{u.userId === data.currentUserId && <span className="subtext">Tài khoản đang sử dụng</span>}</td><td>{u.fullName}<span className="subtext">{u.email ?? 'Chưa có email'}</span></td><td>{u.roles.map(userRoleName).join(', ') || 'Mở chi tiết để đối chiếu'}<span className="subtext">{u.rolesManaged ? 'Đã quản lý tại FIN-05' : 'Ghi nhận từ token đăng nhập'}</span></td><td><span className={`badge ${u.isActive && !u.adminSyncPending ? 'active' : ''}`}>{u.adminSyncPending ? 'Chờ đồng bộ' : u.isActive ? 'Cho phép' : 'Đã khóa'}</span></td><td><button className="text-button" aria-label={`Xem người dùng ${u.username ?? u.userId}`} onClick={() => setDetailId(u.userId)}>Chi tiết ↗</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>Không có người dùng phù hợp</h3><p>Có thể tra cứu chính xác tài khoản Keycloak để liên kết.</p></div>}
    <div className="pagination"><span>{data?.total ?? 0} tài khoản</span><div><button className="page-button" disabled={loading || !!error || query.page <= 1} aria-label="Người dùng trang trước" onClick={() => reload({ page: query.page - 1 })}>‹</button><span>Trang {query.page} / {Math.max(1, Math.ceil((data?.total ?? 0) / 10))}</span><button className="page-button" disabled={loading || !!error || query.page * 10 >= (data?.total ?? 0)} aria-label="Người dùng trang sau" onClick={() => reload({ page: query.page + 1 })}>›</button></div></div></section>
    <p className="receivable-stage-note">Danh sách gồm các tài khoản đã đăng nhập hoặc được quản trị viên liên kết. Mở chi tiết để đọc trạng thái Keycloak hiện tại. Không tự mở lại tài khoản nội bộ đã khóa khi người dùng đăng nhập.</p><footer className="page-footer"><span>FIN-05 · Quản trị người dùng</span><span>Định danh theo Keycloak · Giữ lịch sử nghiệp vụ</span></footer>
    {editor && <UserEditor initial={editor === 'new' ? undefined : editor} onClose={() => { setEditor(null); reload() }} onSaved={r => { setEditor(null); setDetailId(r.user.userId); setNotice('Đã hoàn tất đồng bộ người dùng. Tài khoản đích cần đăng nhập lại để nhận quyền mới.'); reload() }} />}
    {detailId !== null && <UserDetails key={detailId} id={detailId} onClose={() => setDetailId(null)} onEdit={d => { setDetailId(null); setEditor(d) }} />}
    {retry && <RetryOperation operation={retry} onClose={() => { setRetry(null); reload() }} onSaved={() => { setRetry(null); setNotice('Đã hoàn tất tác vụ đồng bộ lại.'); reload() }} />}
  </>
}
function RetryOperation({ operation, onClose, onSaved }: { operation: UserOperation; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal() }, [])
  async function run() {
    if (busy) return
    setBusy(true); setError('')
    try { await request(`/users/operations/${operation.operationId}/retry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowVersion: operation.rowVersion }) }); onSaved() }
    catch (e) { setError(e instanceof Error ? e.message : 'Chưa hoàn tất. Hãy kiểm tra lại tác vụ.') }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="modal invoice-modal" aria-labelledby="retry-user-title" onClose={onClose} onCancel={e => { if (busy) e.preventDefault() }}><div className="modal-heading"><h2 id="retry-user-title">Đồng bộ lại tác vụ #{operation.operationId}</h2><button className="close-button" disabled={busy} aria-label="Đóng đồng bộ lại" onClick={() => dialog.current?.close()}>×</button></div><div className="invoice-form-body">{error && <div className="notice error" role="alert">{error}</div>}<h3>{operation.targetUsername}</h3><p>{operation.desired.firstName} {operation.desired.lastName} · {operation.desired.email}</p><p>Vai trò sẽ áp dụng: <strong>{operation.desired.roles.map(userRoleName).join(', ')}</strong></p><p>Truy cập sau khi hoàn tất: <strong>{operation.desired.enabled ? 'Cho phép' : 'Khóa'}</strong></p><p className="receivable-stage-note">Tiếp tục yêu cầu đã lưu; không tạo lại tài khoản và không đặt lại mật khẩu. Phiên Keycloak của tài khoản đích sẽ được kết thúc.</p></div><div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => dialog.current?.close()}>Quay lại</button><button className="primary" disabled={busy} onClick={() => void run()}>{busy ? 'Đang đồng bộ…' : 'Xác nhận đồng bộ lại'}</button></div></dialog>
}
