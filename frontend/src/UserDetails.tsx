import { useEffect, useRef, useState } from 'react'
import { request } from './api'
import { operationStatus, userRoleName } from './users'
import type { ManagedUserDetail } from './users'

export function UserDetails({ id, onClose, onEdit }: { id: number; onClose: () => void; onEdit: (d: ManagedUserDetail) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [data, setData] = useState<ManagedUserDetail | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal() }, [])
  useEffect(() => {
    const controller = new AbortController()
    request<ManagedUserDetail>(`/users/${id}`, { signal: controller.signal }).then(d => { setData(d); setError('') })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Không đọc được người dùng.') })
    return () => controller.abort()
  }, [id, revision])
  return <dialog ref={dialog} className="modal invoice-modal" aria-labelledby="user-detail-title" onClose={onClose}>
    <div className="modal-heading"><div><span className="eyebrow">HỒ SƠ & QUYỀN TRUY CẬP</span><h2 id="user-detail-title">{data?.keycloak.username ?? `Người dùng #${id}`}</h2></div><button className="close-button" aria-label="Đóng chi tiết người dùng" onClick={() => dialog.current?.close()}>×</button></div>
    <div className="invoice-form-body">{error && <div className="notice error" role="alert">{error}</div>}{data && <><div className="payment-summary"><div><span className={`badge ${data.local.isActive && !data.local.adminSyncPending ? 'active' : ''}`}>{data.local.adminSyncPending ? 'Chờ đồng bộ' : data.local.isActive ? 'Cho phép truy cập' : 'Đã khóa'}</span><h3>{data.local.fullName}</h3><p>{data.local.email ?? 'Chưa có email'}</p><p>Vai trò FIN-05: {data.local.roles.map(userRoleName).join(', ') || 'Chưa ghi nhận vai trò'}</p></div></div>
      <section className="reminder-result"><h3>Đối chiếu Keycloak hiện tại</h3><p>{data.keycloak.firstName} {data.keycloak.lastName}<br />{data.keycloak.email}<br />Trạng thái: {data.keycloak.enabled ? 'Được bật' : 'Đã tắt'}<br />Vai trò nghiệp vụ: {data.keycloak.roles.map(userRoleName).join(', ') || 'Chưa có'}</p>{data.keycloak.requiredActions.includes('UPDATE_PASSWORD') && <p>Cần đổi mật khẩu ở lần đăng nhập đầu.</p>}</section>
      {data.isSelf ? <p className="receivable-stage-note">Đây là tài khoản đang sử dụng. Chọn Tài khoản & mật khẩu trên thanh trên để quản lý thông tin cá nhân.</p> : data.local.adminSyncPending ? <p className="notice error">Tài khoản đang bị chặn để hoàn tất đồng bộ. Đóng chi tiết và xem mục Tác vụ chưa hoàn tất để đối chiếu/thử lại.</p> : <div className="payment-tools"><button className="primary" disabled={!!error} onClick={() => onEdit(data)}>Cập nhật hồ sơ và quyền</button></div>}
      <h3>Lịch sử quản trị</h3>{data.operations.length ? <ol className="reminder-history">{data.operations.map(o => <li key={o.operationId}><strong>#{o.operationId} · {o.kind === 'Create' ? 'Tạo tài khoản' : 'Cập nhật tài khoản'} · {operationStatus(o.status)}</strong><span>{o.actorName} · {new Date(o.startedAt).toLocaleString('vi-VN')}</span>{o.lastError && <p>{o.lastError}</p>}</li>)}</ol> : <p>Chưa có tác vụ thay đổi từ màn hình quản trị. Lịch sử nghiệp vụ đã gắn với tài khoản vẫn được giữ nguyên.</p>}
      <p className="receivable-stage-note">Không hiển thị hoặc lưu mật khẩu trong hồ sơ nghiệp vụ. Vai trò ngoài phạm vi FIN-05 không được chỉnh tại đây.</p></>}
    </div><div className="modal-actions"><button className="text-button" onClick={() => setRevision(c => c + 1)}>Tải lại chi tiết</button><button className="secondary" onClick={() => dialog.current?.close()}>Đóng</button></div>
  </dialog>
}
