import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, request } from './api'
import type { Customer, CustomerPage } from './api'
import './App.css'
import { canWriteCustomers } from './auth'
import { Workspace } from './Workspace'
import { CustomerHistory } from './CustomerHistory'

const fields = [
  { name: 'customerCode', label: 'Mã khách hàng', max: 30, required: true, placeholder: 'VD: KH001' },
  { name: 'customerName', label: 'Tên khách hàng', max: 200, required: true, placeholder: 'VD: Công ty An Bình' },
  { name: 'taxCode', label: 'Mã số thuế', max: 30, placeholder: 'Nhập mã số thuế' },
  { name: 'phone', label: 'Số điện thoại', max: 20, placeholder: 'VD: 0901234567', type: 'tel' },
  { name: 'email', label: 'Email', max: 254, placeholder: 'VD: contact@example.com', type: 'email' },
] as const
const number = new Intl.NumberFormat('vi-VN')
const date = (value: string) => new Date(value.endsWith('Z') ? value : `${value}Z`).toLocaleString('vi-VN')

function App() {
  const canWrite = canWriteCustomers()
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null)
  const [query, setQuery] = useState({ search: '', page: 1, revision: 0, status: 'all' })
  const [editing, setEditing] = useState<Customer | null>(null)
  const [formRevision, setFormRevision] = useState(0)
  const [statusTarget, setStatusTarget] = useState<Customer | null>(null)
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState('')
  const statusDialog = useRef<HTMLDialogElement>(null)
  const [searchInput, setSearchInput] = useState('')
  const [data, setData] = useState<CustomerPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [detail, setDetail] = useState<Customer | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const createDialog = useRef<HTMLDialogElement>(null)
  const detailDialog = useRef<HTMLDialogElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const detailAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ search: query.search, page: String(query.page), pageSize: '10' })
    if (query.status !== 'all') params.set('isActive', String(query.status === 'active'))
    request<CustomerPage>(`/customers?${params}`, { signal: controller.signal })
      .then(result => { setData(result); setError('') })
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof ApiError ? reason.message : 'Không thể kết nối. Kiểm tra Backend rồi bấm Tải lại.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query])

  useEffect(() => () => detailAbort.current?.abort(), [])

  function reload(search = query.search, page = query.page, status = query.status) {
    setLoading(true)
    setError('')
    setQuery(current => ({ search, page, status, revision: current.revision + 1 }))
  }
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    reload(searchInput.trim(), 1)
  }
  function openCreate() {
    setFormRevision(value => value + 1)
    setEditing(null)
    form.current?.reset()
    setFieldErrors({})
    setFormError('')
    createDialog.current?.showModal()
  }
  function openEdit(customer: Customer) {
    setFormRevision(value => value + 1)
    detailDialog.current?.close()
    setEditing(customer)
    setFieldErrors({})
    setFormError('')
    createDialog.current?.showModal()
  }
  function openStatus(customer: Customer) {
    detailDialog.current?.close()
    setStatusTarget(customer)
    setStatusError('')
    statusDialog.current?.showModal()
  }
  async function changeStatus() {
    if (!statusTarget || statusSaving) return
    setStatusSaving(true)
    setStatusError('')
    try {
      const updated = await request<Customer>(`/customers/${statusTarget.customerId}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !statusTarget.isActive, rowVersion: statusTarget.rowVersion }),
      })
      statusDialog.current?.close()
      setSuccess(`Đã ${updated.isActive ? 'kích hoạt lại' : 'ngừng hoạt động'} khách hàng ${updated.customerCode}.`)
      reload(query.search, 1)
    } catch (reason) {
      setStatusError(reason instanceof ApiError ? reason.message : 'Không kết nối được máy chủ. Vui lòng thử lại.')
    } finally { setStatusSaving(false) }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const values = new FormData(event.currentTarget)
    const payload = Object.fromEntries([...values.entries()].map(([key, value]) => [key, String(value).trim() || null]))
    setSaving(true)
    setFormError('')
    setFieldErrors({})
    try {
      const customer = await request<Customer>(editing ? `/customers/${editing.customerId}` : '/customers', {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...payload, rowVersion: editing.rowVersion } : payload),
      })
      createDialog.current?.close()
      setSuccess(`Đã ${editing ? 'cập nhật' : 'thêm'} khách hàng ${customer.customerCode} — ${customer.customerName}.`)
      if (!editing) setSearchInput('')
      reload(editing ? query.search : '', 1, editing ? query.status : 'all')
    } catch (reason) {
      setFormError(reason instanceof ApiError ? reason.message : 'Không kết nối được máy chủ. Thông tin bạn nhập vẫn được giữ lại.')
      if (reason instanceof ApiError) setFieldErrors(Object.fromEntries(Object.entries(reason.errors).map(([key, value]) => [key.charAt(0).toLowerCase() + key.slice(1), value])))
    } finally { setSaving(false) }
  }
  async function openDetail(customer: Customer) {
    detailAbort.current?.abort()
    const controller = new AbortController()
    detailAbort.current = controller
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    detailDialog.current?.showModal()
    try { setDetail(await request<Customer>(`/customers/${customer.customerId}`, { signal: controller.signal })) }
    catch (reason) { if (!controller.signal.aborted) setDetailError(reason instanceof ApiError ? reason.message : 'Không tải được chi tiết khách hàng.') }
    finally { if (!controller.signal.aborted) setDetailLoading(false) }
  }
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 10))

  return (
    <Workspace section="customers">
          <div className="breadcrumb">Danh mục <span>/</span> <strong>Khách hàng</strong></div>
          <div className="page-heading"><div><div className="eyebrow">DANH MỤC KHÁCH HÀNG</div><h1>Khách hàng</h1><p>Thông tin liên hệ và hồ sơ khách hàng của bạn.</p></div>{canWrite && <button className="primary" onClick={openCreate}><span aria-hidden="true">＋</span> Thêm khách hàng</button>}</div>
          {success && <div className="notice success" role="status"><span>{success}</span><button aria-label="Đóng thông báo" onClick={() => setSuccess('')}>×</button></div>}
          {!canWrite && <p className="read-only-note">Bạn có quyền xem khách hàng. Liên hệ nhân viên kinh doanh hoặc quản trị viên để cập nhật hồ sơ.</p>}
          <section className="customer-panel" aria-labelledby="list-heading">
            <div className="panel-heading"><h2 id="list-heading">Danh sách khách hàng <span className="count">{data ? number.format(data.total) : '—'}</span></h2><span className="panel-caption">Hồ sơ được lưu trữ tập trung</span></div>
            <div className="toolbar"><form onSubmit={search} role="search"><label className="sr-only" htmlFor="search">Tìm khách hàng</label><div className="search-input"><span aria-hidden="true">⌕</span><input id="search" placeholder="Tìm theo mã hoặc tên khách hàng…" value={searchInput} maxLength={200} onChange={e => setSearchInput(e.target.value)} /></div><label className="sr-only" htmlFor="status-filter">Lọc trạng thái</label><select id="status-filter" value={query.status} onChange={e => reload(query.search, 1, e.target.value)}><option value="all">Tất cả trạng thái</option><option value="active">Hoạt động</option><option value="inactive">Ngừng hoạt động</option></select><button type="submit" className="secondary">Tìm kiếm</button></form><button className="text-button" onClick={() => reload()} disabled={loading}><span aria-hidden="true">↻</span> Tải lại</button></div>
            {query.search && <div className="filter-summary">Kết quả cho “{query.search}” <button className="text-button" onClick={() => { setSearchInput(''); reload('', 1) }}>Xóa tìm kiếm ×</button></div>}
            {error ? <div className="empty-state" role="alert"><div className="empty-symbol">!</div><h3>Chưa tải được danh sách</h3><p>{error}</p><button className="secondary" onClick={() => reload()}>Thử lại</button></div>
              : loading ? <div className="empty-state" role="status"><div className="spinner" /><p>Đang tải khách hàng…</p></div>
              : data?.items.length ? <div className="table-scroll"><table><thead><tr><th>Mã khách hàng</th><th>Tên khách hàng</th><th>Liên hệ</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{data.items.map(customer => <tr key={customer.customerId}><td><span className="customer-code">{customer.customerCode}</span></td><td><button className="customer-name" onClick={() => openDetail(customer)}>{customer.customerName}</button><span className="subtext">{customer.taxCode ? `MST: ${customer.taxCode}` : 'Chưa có mã số thuế'}</span></td><td><span>{customer.phone || '—'}</span><span className="subtext">{customer.email || 'Chưa có email'}</span></td><td><span className={`badge ${customer.isActive ? 'active' : 'inactive'}`}><i />{customer.isActive ? 'Hoạt động' : 'Ngừng hoạt động'}</span></td><td><button className="text-button" onClick={() => openDetail(customer)} aria-label={`Xem chi tiết ${customer.customerCode}`}>Chi tiết <span aria-hidden="true">↗</span></button></td></tr>)}</tbody></table></div>
                : <div className="empty-state"><div className="empty-symbol" aria-hidden="true">▤</div><h3>{query.search ? 'Không tìm thấy khách hàng' : 'Bắt đầu với khách hàng đầu tiên'}</h3><p>{query.search ? 'Thử một mã hoặc tên khác, hoặc xóa điều kiện tìm kiếm.' : 'Thêm hồ sơ khách hàng để bắt đầu quản lý hóa đơn và công nợ.'}</p>{(canWrite || !!query.search) && <button className="secondary" onClick={query.search ? () => { setSearchInput(''); reload('', 1) } : openCreate}>{query.search ? 'Xóa tìm kiếm' : '＋ Thêm khách hàng'}</button>}</div>}
            <div className="pagination"><span>{!loading && !error && data ? data.total ? `Hiển thị ${(query.page - 1) * 10 + 1}–${Math.min(query.page * 10, data.total)} trong ${number.format(data.total)} khách hàng` : 'Chưa có bản ghi' : 'Danh sách khách hàng'}</span><div><button className="page-button" disabled={loading || !!error || query.page <= 1} onClick={() => reload(query.search, query.page - 1)} aria-label="Trang trước">‹</button><span>Trang {query.page} / {totalPages}</span><button className="page-button" disabled={loading || !!error || query.page >= totalPages} onClick={() => reload(query.search, query.page + 1)} aria-label="Trang sau">›</button></div></div>
          </section>
          <footer className="page-footer"><span>FIN-05 · Quản lý hóa đơn và công nợ phải thu</span><span>Không gian làm việc nội bộ · Đăng nhập qua Keycloak</span></footer>


      {historyCustomer && <CustomerHistory customer={historyCustomer} onClose={() => setHistoryCustomer(null)} />}
      <dialog ref={createDialog} className="modal" aria-labelledby="create-title" onCancel={event => { if (saving) event.preventDefault() }}>
        <div className="modal-heading"><div><span className="eyebrow">{editing ? "CẬP NHẬT HỒ SƠ" : "HỒ SƠ MỚI"}</span><h2 id="create-title">{editing ? "Sửa thông tin khách hàng" : "Thêm khách hàng"}</h2></div><button className="close-button" type="button" aria-label="Đóng biểu mẫu" disabled={saving} onClick={() => createDialog.current?.close()}>×</button></div>
        <form key={formRevision} ref={form} onSubmit={create}>
          <p className="form-intro">Nhập thông tin khách hàng. Các trường có <span className="required">*</span> là bắt buộc.</p>
          {formError && <div className="notice error" role="alert">{formError}</div>}
          <div className="form-grid">{fields.map(field => <label key={field.name} className={field.name === 'customerName' || field.name === 'email' ? 'full-width' : ''} htmlFor={field.name}>{field.label}{'required' in field && <span className="required"> *</span>}<input id={field.name} name={field.name} type={'type' in field ? field.type : 'text'} required={'required' in field} maxLength={field.max} defaultValue={editing?.[field.name] ?? ""} placeholder={field.placeholder} disabled={saving} aria-invalid={!!fieldErrors[field.name]} aria-describedby={fieldErrors[field.name] ? `${field.name}-error` : undefined} />{fieldErrors[field.name] && <span className="field-error" id={`${field.name}-error`}>{fieldErrors[field.name].join(' ')}</span>}</label>)}<label className="full-width" htmlFor="address">Địa chỉ<textarea id="address" name="address" defaultValue={editing?.address ?? ""} rows={3} maxLength={500} placeholder="Nhập địa chỉ liên hệ" disabled={saving} /></label></div>
          <div className="form-hint"><span className={`badge ${!editing || editing.isActive ? "active" : "inactive"}`}><i />{!editing || editing.isActive ? "Hoạt động" : "Ngừng hoạt động"}</span><span>{editing ? "Sửa thông tin không thay đổi trạng thái khách hàng." : "Khách hàng mới được đặt trạng thái hoạt động."}</span></div>
          <div className="modal-actions"><button className="secondary" type="button" disabled={saving} onClick={() => createDialog.current?.close()}>Hủy</button><button className="primary" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Lưu khách hàng'}</button></div>
        </form>
      </dialog>
      <dialog ref={detailDialog} className="modal detail-modal" aria-labelledby="detail-title" onClose={() => detailAbort.current?.abort()}>
        <div className="modal-heading"><div><span className="eyebrow">HỒ SƠ KHÁCH HÀNG</span><h2 id="detail-title">Chi tiết khách hàng</h2></div><button className="close-button" aria-label="Đóng chi tiết" onClick={() => detailDialog.current?.close()}>×</button></div>
        {detailLoading ? <p className="detail-status" role="status">Đang tải thông tin…</p> : detailError ? <p className="notice error" role="alert">{detailError}</p> : detail && <div className="detail-content"><div className="detail-name"><span className="customer-code">{detail.customerCode}</span><h3>{detail.customerName}</h3><span className={`badge ${detail.isActive ? 'active' : 'inactive'}`}><i />{detail.isActive ? 'Hoạt động' : 'Ngừng hoạt động'}</span></div><dl>{[['Mã số thuế', detail.taxCode], ['Số điện thoại', detail.phone], ['Email', detail.email], ['Địa chỉ', detail.address], ['Ngày tạo', date(detail.createdAt)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Chưa cập nhật'}</dd></div>)}</dl></div>}
        <div className="modal-actions detail-actions">{canWrite && detail && !detailLoading && !detailError && <><button className="text-button status-action" onClick={() => openStatus(detail)}>{detail.isActive ? "Ngừng hoạt động" : "Kích hoạt lại"}</button><button className="secondary" onClick={() => { detailDialog.current?.close(); setHistoryCustomer(detail) }}>Lịch sử thao tác</button><button className="primary" onClick={() => openEdit(detail)}>Sửa thông tin</button></>}<button className="secondary" onClick={() => detailDialog.current?.close()}>Đóng</button></div>
      </dialog>
      <dialog ref={statusDialog} className="modal status-modal" aria-labelledby="status-title" onCancel={event => { if (statusSaving) event.preventDefault() }}>
        <div className="modal-heading"><div><span className="eyebrow">THAY ĐỔI TRẠNG THÁI</span><h2 id="status-title">{statusTarget?.isActive ? 'Ngừng hoạt động khách hàng?' : 'Kích hoạt lại khách hàng?'}</h2></div></div>
        <div className="status-content"><p><strong>{statusTarget?.customerCode}</strong> — {statusTarget?.customerName}</p><p>{statusTarget?.isActive ? 'Hồ sơ khách hàng vẫn được giữ lại để bảo toàn thông tin và lịch sử giao dịch. Bạn có thể kích hoạt lại khi cần.' : 'Khách hàng sẽ được chuyển lại sang trạng thái hoạt động.'}</p>{statusError && <div className="notice error" role="alert">{statusError}</div>}</div>
        <div className="modal-actions"><button className="secondary" disabled={statusSaving} onClick={() => statusDialog.current?.close()}>Hủy</button><button className={statusTarget?.isActive ? 'danger' : 'primary'} disabled={statusSaving} onClick={changeStatus}>{statusSaving ? 'Đang cập nhật…' : statusTarget?.isActive ? 'Xác nhận ngừng hoạt động' : 'Xác nhận kích hoạt lại'}</button></div>
      </dialog>
    </Workspace>
  )
}
export default App
