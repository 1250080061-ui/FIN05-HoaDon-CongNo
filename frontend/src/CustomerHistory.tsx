import { useEffect, useRef, useState } from 'react'
import { ApiError, request } from './api'
import type { Customer } from './api'

type Entry = { auditLogId: number; action: string; actionTime: string; actorName: string; description: string | null }
type HistoryPage = { items: Entry[]; total: number; page: number; pageSize: number }
const actions: Record<string, string> = {
  'Customer.Create': 'Thêm khách hàng', 'Customer.Update': 'Sửa thông tin',
  'Customer.Deactivate': 'Ngừng hoạt động', 'Customer.Activate': 'Kích hoạt lại',
}
const fields: Record<string, string> = {
  CustomerCode: 'Mã khách hàng', CustomerName: 'Tên khách hàng', TaxCode: 'Mã số thuế',
  Phone: 'Số điện thoại', Email: 'Email', Address: 'Địa chỉ', IsActive: 'Trạng thái',
}
function value(input: unknown) {
  return typeof input === 'boolean' ? input ? 'Hoạt động' : 'Ngừng hoạt động' : String(input ?? '') || '—'
}
function parseChanges(description: string) {
  try {
    const data = JSON.parse(description) as { Before: Record<string, unknown> | null; After: Record<string, unknown> }
    return data?.After && typeof data.After === 'object' ? data : null
  } catch { return null }
}
function Changes({ description }: { description: string | null }) {
  if (!description) return <p>Chưa có nội dung chi tiết.</p>
  const data = parseChanges(description)
  if (!data) return <p>{description}</p>
  const changed = Object.keys(fields).filter(key => data.Before?.[key] !== data.After[key])
  return <div className="table-scroll"><table className="change-table"><thead><tr><th>Thông tin</th><th>Trước</th><th>Sau</th></tr></thead><tbody>{changed.map(key => <tr key={key}><td>{fields[key]}</td><td>{value(data.Before?.[key])}</td><td>{value(data.After[key])}</td></tr>)}</tbody></table></div>
}
export function CustomerHistory({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState({ page: 1, revision: 0 })
  const [data, setData] = useState<HistoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal() }, [])
  useEffect(() => {
    const controller = new AbortController()
    request<HistoryPage>(`/customers/${customer.customerId}/audit?page=${query.page}&pageSize=10`, { signal: controller.signal })
      .then(result => { setData(result); setError('') })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof ApiError ? reason.message : 'Không tải được lịch sử thao tác.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [customer.customerId, query])
  function reload(page = query.page) {
    setLoading(true)
    setError('')
    setQuery(current => ({ page, revision: current.revision + 1 }))
  }
  return <dialog ref={dialog} className="modal history-modal" aria-labelledby="history-title" onClose={onClose}>
    <div className="modal-heading"><div><span className="eyebrow">{customer.customerCode}</span><h2 id="history-title">Lịch sử thao tác</h2></div><button className="close-button" aria-label="Đóng lịch sử" onClick={() => dialog.current?.close()}>×</button></div>
    <div className="history-body"><p className="history-customer">{customer.customerName}</p>
      {loading ? <p role="status">Đang tải lịch sử…</p> : error ? <div role="alert" className="notice error">{error}<button onClick={() => reload()} className="secondary">Thử lại</button></div> : data?.items.length ? <ol className="history-list">{data.items.map(entry => <li key={entry.auditLogId}><div className="history-event"><strong>{actions[entry.action] ?? entry.action}</strong><time dateTime={entry.actionTime}>{new Date(entry.actionTime).toLocaleString('vi-VN')}</time></div><p className="history-actor">Người thực hiện: {entry.actorName}</p><details><summary>Xem thay đổi</summary><Changes description={entry.description} /></details></li>)}</ol> : <p className="history-empty">Chưa có lịch sử thao tác. Hồ sơ được tạo trước khi bật nhật ký sẽ có lịch sử từ lần cập nhật tiếp theo.</p>}
    </div>
    <div className="pagination"><span>{data ? `${data.total} thao tác` : 'Lịch sử khách hàng'}</span><div><button className="page-button" aria-label="Lịch sử trang trước" disabled={loading || !!error || query.page <= 1} onClick={() => reload(query.page - 1)}>‹</button><span>Trang {query.page} / {Math.max(1, Math.ceil((data?.total ?? 0) / 10))}</span><button className="page-button" aria-label="Lịch sử trang sau" disabled={loading || !!error || query.page * 10 >= (data?.total ?? 0)} onClick={() => reload(query.page + 1)}>›</button></div></div>
    <div className="modal-actions"><button className="secondary" onClick={() => dialog.current?.close()}>Đóng</button></div>
  </dialog>
}
