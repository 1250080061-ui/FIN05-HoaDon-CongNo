import { useEffect, useState } from 'react'
import { request } from './api'
import { canReadAdjustments, canWriteAdjustments } from './auth'
import { Workspace } from './Workspace'
import { AdjustmentEditor } from './AdjustmentEditor'
import { AdjustmentDetails } from './AdjustmentDetails'
import { adjustmentStatus } from './adjustments'
import type { Adjustment, AdjustmentInvoice } from './adjustments'
import { money } from './invoices'
import { displayDate } from './reminders'

type Page<T> = { items: T[]; total: number; asOfDate?: string }
export function AdjustmentsPage() {
  return <Workspace section="adjustments">{canReadAdjustments() ? <Adjustments /> : <div className="empty-state"><h1>Không có quyền xem điều chỉnh công nợ</h1><p>Chức năng dành cho kế toán, quản lý và quản trị viên.</p><a href="/">Về khách hàng</a></div>}</Workspace>
}
function Adjustments() {
  const [query, setQuery] = useState({ tab: 'history', search: '', status: '', invoiceId: null as number | null, page: 1, revision: 0 })
  const [term, setTerm] = useState('')
  const [invoices, setInvoices] = useState<Page<AdjustmentInvoice> | null>(null)
  const [history, setHistory] = useState<Page<Adjustment> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState<{ invoice: AdjustmentInvoice; initial?: Adjustment; date: string } | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ search: query.search, page: String(query.page), pageSize: '10' })
    if (query.tab === 'history') { if (query.status) params.set('status', query.status); if (query.invoiceId) params.set('invoiceId', String(query.invoiceId)) }
    request<Page<Adjustment | AdjustmentInvoice>>(`${query.tab === 'invoices' ? '/adjustments/invoices' : '/adjustments'}?${params}`, { signal: controller.signal })
      .then(r => { if (query.tab === 'invoices') setInvoices(r as Page<AdjustmentInvoice>); else setHistory(r as Page<Adjustment>); setError('') })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Không tải được điều chỉnh.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query])
  function reload(change: Partial<typeof query> = {}) { setLoading(true); setError(''); setQuery(c => ({ ...c, ...change, revision: c.revision + 1 })) }
  const choosing = query.tab === 'invoices', count = (choosing ? invoices?.total : history?.total) ?? 0
  return <><div className="breadcrumb">Nghiệp vụ <span>/</span><strong>Điều chỉnh công nợ</strong></div><div className="page-heading"><div><div className="eyebrow">CHỨNG TỪ & ĐỐI CHIẾU</div><h1>Điều chỉnh công nợ</h1><p>Ghi nhận tăng hoặc giảm phải thu với bút toán đối ứng cân bằng.</p></div></div>
    <div className="reminder-tabs"><button className={!choosing ? 'primary' : 'secondary'} aria-pressed={!choosing} onClick={() => reload({ tab: 'history', invoiceId: null, page: 1 })}>Lịch sử điều chỉnh</button><button className={choosing ? 'primary' : 'secondary'} aria-pressed={choosing} onClick={() => reload({ tab: 'invoices', page: 1 })}>Chọn hóa đơn điều chỉnh</button></div>
    <section className="customer-panel" aria-labelledby="adjustment-list-title"><div className="panel-heading"><h2 id="adjustment-list-title">{choosing ? 'Hóa đơn đã phát hành' : 'Danh sách điều chỉnh'}</h2><span className="panel-caption">Giữ nguyên hóa đơn gốc và lịch sử chứng từ</span></div>
      <div className="toolbar"><form role="search" onSubmit={e => { e.preventDefault(); reload({ search: term.trim(), page: 1 }) }}><div className="search-input"><span aria-hidden="true">⌕</span><label className="sr-only" htmlFor="adjustment-search">Tìm điều chỉnh</label><input id="adjustment-search" value={term} maxLength={200} onChange={e => setTerm(e.target.value)} placeholder="Tìm hóa đơn, mã hoặc tên khách hàng…" /></div>{!choosing && <><label className="sr-only" htmlFor="adjustment-status-filter">Trạng thái điều chỉnh</label><select id="adjustment-status-filter" value={query.status} onChange={e => reload({ status: e.target.value, page: 1 })}><option value="">Tất cả trạng thái</option><option value="Draft">Nháp</option><option value="Posted">Đã ghi nhận</option><option value="Reversed">Đã đảo</option></select></>}<button className="secondary" type="submit">Tìm kiếm</button></form><button className="text-button" disabled={loading} onClick={() => reload()}>↻ Tải lại</button></div>
      {!choosing && query.invoiceId && <button className="text-button" onClick={() => reload({ invoiceId: null, page: 1 })}>Xóa lọc hóa đơn #{query.invoiceId}</button>}
      {error ? <div className="empty-state" role="alert"><p>{error}</p><button className="secondary" onClick={() => reload()}>Thử lại</button></div> : loading ? <div className="empty-state" role="status"><div className="spinner" /><p>Đang tải danh sách…</p></div> : count ? <div className="table-scroll"><table><thead>{choosing ? <tr><th>Hóa đơn / Khách hàng</th><th>Giá trị gốc</th><th>Điều chỉnh có hiệu lực</th><th>Đã phân bổ</th><th>Còn phải thu</th><th /></tr> : <tr><th>Điều chỉnh / Hóa đơn</th><th>Khách hàng</th><th>Ngày điều chỉnh</th><th>Số tiền có dấu (VND)</th><th>Trạng thái</th><th /></tr>}</thead><tbody>
        {choosing ? invoices?.items.map(i => <tr key={i.invoiceId}><td><span className="customer-code">{i.invoiceNumber}</span><span className="subtext">{i.customerCode} · {i.customerName}</span></td><td className="amount">{money(i.originalAmount)}</td><td className="amount">{money(i.adjustmentAmount ?? '0')}</td><td className="amount">{money(i.paidAmount ?? '0')}</td><td className="amount">{money(i.remainingAmount)}</td><td><div className="reminder-row-actions">{canWriteAdjustments() && <button className="text-button" aria-label={`Lập điều chỉnh ${i.invoiceNumber}`} onClick={() => setEditor({ invoice: i, date: invoices.asOfDate! })}>Lập điều chỉnh</button>}<button className="text-button" aria-label={`Lịch sử điều chỉnh ${i.invoiceNumber}`} onClick={() => reload({ tab: 'history', invoiceId: i.invoiceId, status: '', page: 1 })}>Lịch sử ↗</button></div></td></tr>) : history?.items.map(a => <tr key={a.adjustmentId}><td><span className="customer-code">#{a.adjustmentId}</span><span className="subtext">{a.invoiceNumber}</span></td><td>{a.customerName}<span className="subtext">{a.customerCode}</span></td><td>{displayDate(a.adjustmentDate)}</td><td className="amount">{money(a.signedAmount)}</td><td><span className={`badge ${a.status === 'Posted' ? 'active' : ''}`}>{adjustmentStatus(a.status)}</span></td><td><button className="text-button" aria-label={`Xem điều chỉnh ${a.adjustmentId}`} onClick={() => setDetailId(a.adjustmentId)}>Chi tiết ↗</button></td></tr>)}
      </tbody></table></div> : <div className="empty-state"><div className="empty-symbol">⇄</div><h3>{choosing ? 'Không có hóa đơn phù hợp' : 'Chưa có điều chỉnh phù hợp'}</h3><p>Chọn hóa đơn đã phát hành để lập điều chỉnh. Bản nháp không thay đổi số dư.</p></div>}
      <div className="pagination"><span>{count} {choosing ? 'hóa đơn' : 'điều chỉnh'}</span><div><button className="page-button" disabled={loading || !!error || query.page <= 1} aria-label="Điều chỉnh trang trước" onClick={() => reload({ page: query.page - 1 })}>‹</button><span>Trang {query.page} / {Math.max(1, Math.ceil(count / 10))}</span><button className="page-button" disabled={loading || !!error || query.page * 10 >= count} aria-label="Điều chỉnh trang sau" onClick={() => reload({ page: query.page + 1 })}>›</button></div></div>
    </section><p className="receivable-stage-note">Công nợ = giá trị hóa đơn + điều chỉnh đã ghi nhận còn hiệu lực − tiền đã phân bổ. Chứng từ đã ghi nhận được sửa sai bằng bút toán đảo. Danh mục tài khoản hiện là mô phỏng cho đồ án.</p><footer className="page-footer"><span>FIN-05 · Điều chỉnh công nợ</span><span>Nháp → Ghi nhận → Đảo khi sửa sai</span></footer>
    {editor && <AdjustmentEditor invoice={editor.invoice} initial={editor.initial} asOfDate={editor.date} onClose={() => setEditor(null)} onSaved={a => { setEditor(null); setDetailId(a.adjustmentId); reload() }} />}
    {detailId !== null && <AdjustmentDetails key={detailId} id={detailId} onClose={() => setDetailId(null)} onChanged={() => reload()} onEdit={a => { setDetailId(null); setEditor({ invoice: a, initial: a, date: a.asOfDate }) }} />}
  </>
}
