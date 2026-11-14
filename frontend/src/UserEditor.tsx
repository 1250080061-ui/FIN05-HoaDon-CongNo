import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, request } from './api'
import { businessRoles, userRoleName } from './users'
import type { ManagedUserDetail, UserResult } from './users'

export function UserEditor({ initial, onClose, onSaved }: { initial?: ManagedUserDetail; onClose: () => void; onSaved: (r: UserResult) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [username, setUsername] = useState('')
  const [firstName, setFirstName] = useState(initial?.keycloak.firstName ?? '')
  const [lastName, setLastName] = useState(initial?.keycloak.lastName ?? '')
  const [email, setEmail] = useState(initial?.keycloak.email ?? '')
  const [roles, setRoles] = useState<string[]>(initial?.keycloak.roles ?? ['sales'])
  const [enabled, setEnabled] = useState(initial ? initial.local.isActive && initial.keycloak.enabled : true)
  const [password, setPassword] = useState('')
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal() }, [])
  function check(e: FormEvent) { e.preventDefault(); if (roles.length) setReview(true) }
  async function save() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const r = await request<UserResult>(initial ? `/users/${initial.local.userId}` : '/users', { method: initial ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), roles, enabled,
          ...(initial ? { rowVersion: initial.local.rowVersion } : { username: username.trim(), initialPassword: password }) }) })
      setPassword(''); onSaved(r)
    } catch (e) { setError(e instanceof ApiError ? [e.message, ...Object.values(e.errors).flat()].join(' ') : 'Chưa xác định được kết quả. Hãy đóng form, tải lại danh sách và kiểm tra tác vụ trước khi gửi lại.') }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="modal invoice-modal" aria-labelledby="user-editor-title" onClose={onClose} onCancel={e => { if (busy) e.preventDefault() }}>
    <div className="modal-heading"><div><span className="eyebrow">QUẢN TRỊ NGƯỜI DÙNG</span><h2 id="user-editor-title">{initial ? `Cập nhật ${initial.keycloak.username}` : 'Tạo tài khoản mới'}</h2></div><button className="close-button" disabled={busy} aria-label="Đóng chỉnh người dùng" onClick={() => dialog.current?.close()}>×</button></div>
    <div className="invoice-form-body">{error && <div className="notice error" role="alert">{error}</div>}
      {!review ? <form id="user-editor-form" onSubmit={check}><div className="form-grid">{!initial && <><label htmlFor="user-username">Tên đăng nhập *<input id="user-username" autoComplete="off" required pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,63}" minLength={3} maxLength={64} value={username} onChange={e => setUsername(e.target.value)} /><span className="subtext">3–64 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.</span></label><label htmlFor="user-password">Mật khẩu tạm *<input id="user-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /><span className="subtext">Ít nhất 12 ký tự; người dùng phải đổi ở lần đăng nhập đầu.</span></label></>}
        <label htmlFor="user-first-name">Họ và tên đệm *<input id="user-first-name" required maxLength={75} value={firstName} onChange={e => setFirstName(e.target.value)} /></label><label htmlFor="user-last-name">Tên *<input id="user-last-name" required maxLength={74} value={lastName} onChange={e => setLastName(e.target.value)} /></label><label className="full-width" htmlFor="user-email">Email *<input id="user-email" required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
      </div><fieldset className="user-role-picker"><legend>Vai trò nghiệp vụ (chọn ít nhất một)</legend>{businessRoles.map(role => <label key={role}><input type="checkbox" checked={roles.includes(role)} onChange={e => setRoles(c => e.target.checked ? [...c, role] : c.filter(x => x !== role))} />{userRoleName(role)}</label>)}</fieldset><label className="user-enabled"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Cho phép truy cập FIN-05</label></form> : <div className="payment-confirm"><h3>Kiểm tra trước khi xác nhận</h3><p>Tài khoản: <strong>{initial?.keycloak.username ?? username}</strong><br />Họ tên: {firstName} {lastName}<br />Email: {email}</p><p>Vai trò: <strong>{roles.map(userRoleName).join(', ')}</strong><br />Truy cập: <strong>{enabled ? 'Cho phép' : 'Khóa'}</strong></p>{roles.includes('admin') && <p>Bạn đang cấp quyền quản trị người dùng trong FIN-05 cho tài khoản này.</p>}<p>{initial ? 'Hệ thống đồng bộ hồ sơ, vai trò và trạng thái; phiên Keycloak hiện tại của tài khoản đích sẽ được kết thúc. Người dùng cần đăng nhập lại để nhận quyền mới.' : 'Tài khoản được tạo với mật khẩu tạm và yêu cầu đổi mật khẩu ở lần đăng nhập đầu. Hãy cung cấp mật khẩu tạm cho đúng người dùng bằng cách phù hợp.'}</p></div>}
      {initial && <p className="receivable-stage-note">Thao tác này không đặt lại mật khẩu. Nếu đồng bộ chưa hoàn tất, tài khoản đích tạm bị chặn và có tác vụ để đối chiếu/thử lại.</p>}
    </div><div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => review ? setReview(false) : dialog.current?.close()}>{review ? 'Quay lại chỉnh' : 'Hủy'}</button>{review ? <button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Đang đồng bộ…' : 'Xác nhận lưu người dùng'}</button> : <button className="primary" type="submit" form="user-editor-form" disabled={!roles.length}>Kiểm tra thay đổi</button>}</div>
  </dialog>
}
