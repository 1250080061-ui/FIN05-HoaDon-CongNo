import { useEffect, useState } from 'react'
import { request } from './api'
import { canReadPayments, canWritePayments } from './auth'
import { Workspace } from './Workspace'
import { PaymentEditor } from './PaymentEditor'
import { PaymentDetails } from './PaymentDetails'
import { money } from './invoices'
import { paymentMethod, paymentStatus } from './payments'
import type { Payment } from './payments'

export function PaymentsPage() {
  return <Workspace section="payments">{canReadPayments() ? <Payments /> : <div className="empty-state"><h1>Không có quyền xem phiếu thu</h1><p>Chức năng dành cho thu tiền, kế toán, quản lý và quản trị viên.</p><a href="/">Về khách hàng</a></div>}</Workspace>
}
function Payments() {
  const [query, setQuery] = useState({ search: '', status: '', page: 1, revision: 0 })
  const [term, setTerm] = useState('')
  const [data, setData] = useState<{ items: Payment[]; total: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState<Payment | 'new' | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ search: query.search, page: String(query.page), pageSize: '10' })
    if (query.status) params.set('status', query.status)
    request<{ items: Payment[]; total: number }>(`/payments?${params}`, { signal: controller.signal })
      .then(result => { setData(result); setError('') })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Không tải được phiếu thu.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query])
  function reload(search = query.search, page = query.page, status = query.status) {
    setLoading(true); setError(''); setQuery(c => ({ search, page, status, revision: c.revision + 1 }))
  }
  return <><div className="breadcrumb">Nghiệp vụ <span>/</span><strong>Phiếu thu & phân bổ</strong></div><div className="page-heading"><div><div className="eyebrow">GHI NHẬN THANH TOÁN</div><h1>Phiếu thu</h1><p>Xác nhận khoản thu và phân bổ tiền vào hóa đơn cùng khách hàng.</p></div>{canWritePayments() && <button className="primary" onClick={() => setEditor('new')}>＋ Lập phiếu thu</button>}</div>
    {notice && <div className="notice success" role="status">{notice}</div>}
    <section className="customer-panel" aria-labelledby="payments-list-title"><div className="panel-heading"><h2 id="payments-list-title">Danh sách phiếu thu</h2><span className="panel-caption">Nháp → Xác nhận → Phân bổ</span></div><div className="toolbar"><form role="search" onSubmit={e => { e.preventDefault(); reload(term.trim(), 1) }}><div className="search-input"><span aria-hidden="true">⌕</span><label className="sr-only" htmlFor="payment-search">Tìm phiếu thu</label><input id="payment-search" value={term} maxLength={200} onChange={e => setTerm(e.target.value)} placeholder="Tìm số phiếu, khách hàng, mã tham chiếu…" /></div><label className="sr-only" htmlFor="payment-status">Trạng thái phiếu thu</label><select id="payment-status" value={query.status} onChange={e => reload(query.search, 1, e.target.value)}><option value="">Tất cả trạng thái</option><option value="Draft">Nháp</option><option value="Confirmed">Đã xác nhận</option></select><button className="secondary" type="submit">Tìm kiếm</button></form><button className="text-button" disabled={loading} onClick={() => reload()}>↻ Tải lại</button></div>
    {error ? <div className="empty-state" role="alert"><p>{error}</p><button className="secondary" onClick={() => reload()}>Thử lại</button></div> : loading ? <div className="empty-state" role="status"><div className="spinner" /><p>Đang tải phiếu thu…</p></div> : data?.items.length ? <div className="table-scroll"><table><thead><tr><th>Số phiếu / Ngày thu</th><th>Khách hàng</th><th>Số tiền (VND)</th><th>Chưa phân bổ (VND)</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{data.items.map(p => <tr key={p.paymentId}><td><span className="customer-code">{p.paymentNumber}</span><span className="subtext">{p.paymentDate.split('-').reverse().join('/')} · {paymentMethod(p.paymentMethod)}</span></td><td>{p.customerName}<span className="subtext">{p.customerCode}</span></td><td className="amount">{money(p.amount)}</td><td className="amount">{money(p.unallocatedAmount)}</td><td><span className={`badge ${p.status === 'Confirmed' ? 'active' : ''}`}>{paymentStatus(p.status)}</span><span className="subtext">{p.status === 'Draft' ? 'Chưa thể phân bổ' : p.unallocatedAmount === '0.00' ? 'Đã phân bổ hết' : 'Còn tiền chưa phân bổ'}</span></td><td><button className="text-button" aria-label={`Xem phiếu thu ${p.paymentNumber}`} onClick={() => setDetailId(p.paymentId)}>Chi tiết ↗</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-symbol">▤</div><h3>{query.search || query.status ? 'Không có phiếu thu phù hợp' : 'Chưa có phiếu thu'}</h3><p>Nhân viên thu tiền lập phiếu; kế toán phân bổ sau khi phiếu được xác nhận.</p></div>}
    <div className="pagination"><span>{data?.total ?? 0} phiếu thu</span><div><button className="page-button" disabled={loading || !!error || query.page <= 1} aria-label="Phiếu thu trang trước" onClick={() => reload(query.search, query.page - 1)}>‹</button><span>Trang {query.page} / {Math.max(1, Math.ceil((data?.total ?? 0) / 10))}</span><button className="page-button" disabled={loading || !!error || query.page * 10 >= (data?.total ?? 0)} aria-label="Phiếu thu trang sau" onClick={() => reload(query.search, query.page + 1)}>›</button></div></div></section>
    <p className="receivable-stage-note">Tiền chưa phân bổ được giữ riêng trên phiếu thu. Công nợ hóa đơn chỉ giảm theo số đã phân bổ thành công; phiếu đã xác nhận và lịch sử phân bổ được khóa chỉnh sửa.</p><footer className="page-footer"><span>FIN-05 · Phiếu thu & phân bổ</span><span>VND · Ghi nhận thủ công, chưa kết nối ngân hàng</span></footer>
    {editor && <PaymentEditor initial={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={p => { setEditor(null); setDetailId(p.paymentId); setNotice('Đã lưu phiếu thu nháp. Kiểm tra trước khi xác nhận.'); reload() }} />}
    {detailId !== null && <PaymentDetails key={detailId} id={detailId} onClose={() => setDetailId(null)} onEdit={p => { setDetailId(null); setEditor(p) }} onChanged={() => { setNotice(''); reload() }} />}
  </>
}
