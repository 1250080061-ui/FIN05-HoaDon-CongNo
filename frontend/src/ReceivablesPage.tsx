import { useEffect, useState } from 'react'
import { request } from './api'
import { canReadInvoices } from './auth'
import { Workspace } from './Workspace'
import { InvoiceDetails } from './InvoiceDetails'
import { money } from './invoices'

type Receivable = { invoiceId: number; invoiceNumber: string; customerCode: string; customerName: string;
  dueDate: string; originalAmount: string; adjustmentAmount: string; paidAmount: string; remainingAmount: string;
  isOverdue: boolean; overdueDays: number; paymentStatus: string }
type Page = { items: Receivable[]; total: number; asOfDate: string;
  summary: { remainingAmount: string; overdueAmount: string; invoiceCount: number } }

export function ReceivablesPage() {
  return <Workspace section="receivables">{canReadInvoices() ? <Receivables /> : <div className="empty-state"><h1>Không có quyền xem công nợ</h1><p>Chức năng dành cho kế toán, ban quản lý và quản trị viên.</p><a className="secondary" href="/">Về danh sách khách hàng</a></div>}</Workspace>
}
function Receivables() {
  const [query, setQuery] = useState(() => ({ search: '', overdue: new URLSearchParams(window.location.search).get('overdue') === 'true' ? 'true' : '', page: 1, revision: 0 }))
  const [term, setTerm] = useState('')
  const [data, setData] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detailId, setDetailId] = useState<number | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ search: query.search, page: String(query.page), pageSize: '10' })
    if (query.overdue) params.set('overdue', query.overdue)
    request<Page>(`/receivables?${params}`, { signal: controller.signal })
      .then(result => { setData(result); setError('') })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Không tải được công nợ.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query])
  function reload(search = query.search, page = query.page, overdue = query.overdue) {
    setLoading(true); setError(''); setQuery(current => ({ search, page, overdue, revision: current.revision + 1 }))
  }
  return <><div className="breadcrumb">Nghiệp vụ <span>/</span><strong>Công nợ phải thu</strong></div><div className="page-heading"><div><div className="eyebrow">THEO DÕI THANH TOÁN</div><h1>Công nợ phải thu</h1><p>Các khoản phải thu từ hóa đơn đã phát hành mô phỏng.</p></div><span className="as-of-date">{data ? `Đến ngày ${data.asOfDate.split('-').reverse().join('/')}` : 'Ngày nghiệp vụ tại Việt Nam'}</span></div>
    <div className="receivable-stats" aria-label="Tổng hợp theo bộ lọc"><div><span>Còn phải thu (VND)</span><strong>{data && !error && !loading ? money(data.summary.remainingAmount) : '—'}</strong><small>Theo bộ lọc hiện tại</small></div><div className="overdue-stat"><span>Đã quá hạn (VND)</span><strong>{data && !error && !loading ? money(data.summary.overdueAmount) : '—'}</strong><small>Hạn thanh toán trước ngày hiện tại</small></div><div><span>Số hóa đơn</span><strong>{data && !error && !loading ? data.summary.invoiceCount : '—'}</strong><small>Chỉ hóa đơn đã phát hành</small></div></div>
    <section className="customer-panel" aria-labelledby="receivable-list-title"><div className="panel-heading"><h2 id="receivable-list-title">Danh sách công nợ</h2><span className="panel-caption">Bản nháp và bản hủy không phát sinh phải thu</span></div><div className="toolbar"><form role="search" onSubmit={event => { event.preventDefault(); reload(term.trim(), 1) }}><div className="search-input"><span aria-hidden="true">⌕</span><label className="sr-only" htmlFor="receivable-search">Tìm công nợ</label><input id="receivable-search" value={term} onChange={e => setTerm(e.target.value)} maxLength={200} placeholder="Tìm số hóa đơn, mã hoặc tên khách hàng…" /></div><label className="sr-only" htmlFor="receivable-overdue">Lọc công nợ quá hạn</label><select id="receivable-overdue" value={query.overdue} onChange={e => reload(query.search, 1, e.target.value)}><option value="">Tất cả thời hạn</option><option value="true">Đã quá hạn</option><option value="false">Không quá hạn (gồm đã thanh toán)</option></select><button className="secondary" type="submit">Tìm kiếm</button></form><button className="text-button" disabled={loading} onClick={() => reload()}>↻ Tải lại</button></div>
    {error ? <div className="empty-state" role="alert"><h3>Chưa tải được công nợ</h3><p>{error}</p><button className="secondary" onClick={() => reload()}>Thử lại</button></div> : loading ? <div className="empty-state" role="status"><div className="spinner" /><p>Đang tổng hợp công nợ…</p></div> : data?.items.length ? <div className="table-scroll"><table><thead><tr><th>Số hóa đơn</th><th>Khách hàng</th><th>Hạn thanh toán</th><th>Điều chỉnh (VND)</th><th>Đã phân bổ (VND)</th><th>Còn phải thu (VND)</th><th>Tình trạng</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{data.items.map(item => <tr key={item.invoiceId}><td><span className="customer-code">{item.invoiceNumber}</span></td><td>{item.customerName}<span className="subtext">{item.customerCode}</span></td><td>{item.dueDate.split('-').reverse().join('/')}</td><td className="amount">{money(item.adjustmentAmount)}</td><td className="amount">{money(item.paidAmount)}</td><td className="amount">{money(item.remainingAmount)}</td><td><span className={`badge ${item.isOverdue ? 'overdue' : 'active'}`}>{item.paymentStatus === 'Settled' ? 'Đã tất toán' : item.paymentStatus === 'Paid' ? 'Đã thanh toán' : item.isOverdue ? `Quá hạn ${item.overdueDays} ngày` : item.dueDate === data.asOfDate ? 'Đến hạn hôm nay' : 'Trong hạn'}</span></td><td><button className="text-button" aria-label={`Xem công nợ ${item.invoiceNumber}`} onClick={() => setDetailId(item.invoiceId)}>Chi tiết ↗</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-symbol">▤</div><h3>{query.search || query.overdue ? 'Không có khoản phải thu phù hợp' : 'Chưa có khoản phải thu'}</h3><p>Khoản phải thu xuất hiện sau khi hóa đơn được phát hành thành công.</p>{(query.search || query.overdue) && <button className="secondary" onClick={() => { setTerm(''); reload('', 1, '') }}>Xóa bộ lọc</button>}</div>}
    <div className="pagination"><span>{data ? `${data.total} khoản phải thu` : 'Công nợ phải thu'}</span><div><button className="page-button" aria-label="Công nợ trang trước" disabled={loading || !!error || query.page <= 1} onClick={() => reload(query.search, query.page - 1)}>‹</button><span>Trang {query.page} / {Math.max(1, Math.ceil((data?.total ?? 0) / 10))}</span><button className="page-button" aria-label="Công nợ trang sau" disabled={loading || !!error || query.page * 10 >= (data?.total ?? 0)} onClick={() => reload(query.search, query.page + 1)}>›</button></div></div></section>
    <p className="receivable-stage-note">Còn phải thu = giá trị hóa đơn + điều chỉnh đã ghi nhận còn hiệu lực − tiền đã phân bổ. Bản nháp, điều chỉnh đã đảo và khoản thu chưa phân bổ không làm giảm công nợ hóa đơn.</p><footer className="page-footer"><span>FIN-05 · Công nợ phải thu</span><span>Phát hành mô phỏng · Không gửi cơ quan thuế</span></footer>
    {detailId !== null && <InvoiceDetails id={detailId} onClose={() => setDetailId(null)} onEdit={() => window.location.assign('/invoices')} onChanged={() => reload()} />}
  </>
}
