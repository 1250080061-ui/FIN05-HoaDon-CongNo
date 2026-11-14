import { useEffect, useState } from 'react'
import { request } from './api'
import { canReadInvoices, canWriteInvoices } from './auth'
import { Workspace } from './Workspace'
import { InvoiceEditor } from './InvoiceEditor'
import { InvoiceDetails } from './InvoiceDetails'
import { money, statuses } from './invoices'
import type { Invoice } from './invoices'

export function InvoicesPage() {
  return <Workspace section="invoices">{canReadInvoices() ? <Invoices /> : <div className="empty-state"><h1>Không có quyền truy cập hóa đơn</h1><p>Chức năng này dành cho kế toán, ban quản lý và quản trị viên.</p><a className="secondary" href="/">Về danh sách khách hàng</a></div>}</Workspace>
}
function Invoices() {
  const [query, setQuery] = useState({ search: '', status: '', page: 1, revision: 0 })
  const [term, setTerm] = useState('')
  const [data, setData] = useState<{ items: Invoice[]; total: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState<{ initial?: Invoice } | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ search: query.search, page: String(query.page), pageSize: '10' })
    if (query.status) params.set('status', query.status)
    request<{ items: Invoice[]; total: number }>(`/invoices?${params}`, { signal: controller.signal })
      .then(result => { setData(result); setError('') })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Không tải được hóa đơn.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query])
  function reload(search = query.search, page = query.page, status = query.status) {
    setLoading(true); setError(''); setQuery(current => ({ search, page, status, revision: current.revision + 1 }))
  }
  return <><div className="breadcrumb">Nghiệp vụ <span>/</span><strong>Hóa đơn</strong></div><div className="page-heading"><div><div className="eyebrow">QUẢN LÝ HÓA ĐƠN</div><h1>Hóa đơn</h1><p>Lập bản nháp và quản lý chi tiết hàng hóa, dịch vụ.</p></div>{canWriteInvoices() && <button className="primary" onClick={() => setEditor({})}>＋ Lập hóa đơn</button>}</div>
    {notice && <div className="notice success" role="status">{notice}<button aria-label="Đóng thông báo" onClick={() => setNotice('')}>×</button></div>}{!canWriteInvoices() && <p className="read-only-note">Bạn có quyền xem. Chỉ kế toán và quản trị viên được lập hoặc sửa hóa đơn.</p>}
    <section className="customer-panel" aria-labelledby="invoice-list-title"><div className="panel-heading"><h2 id="invoice-list-title">Danh sách hóa đơn <span className="count">{data?.total ?? '—'}</span></h2><span className="panel-caption">Bản nháp chưa phát sinh công nợ</span></div>
    <div className="toolbar"><form onSubmit={event => { event.preventDefault(); reload(term.trim(), 1) }} role="search"><div className="search-input"><span aria-hidden="true">⌕</span><label className="sr-only" htmlFor="invoice-search">Tìm hóa đơn</label><input id="invoice-search" maxLength={200} placeholder="Tìm mã nháp, số hóa đơn hoặc khách hàng…" value={term} onChange={e => setTerm(e.target.value)} /></div><label className="sr-only" htmlFor="invoice-status">Lọc trạng thái hóa đơn</label><select id="invoice-status" value={query.status} onChange={e => reload(query.search, 1, e.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button className="secondary" type="submit">Tìm kiếm</button></form><button className="text-button" disabled={loading} onClick={() => reload()}>↻ Tải lại</button></div>
    {error ? <div className="empty-state" role="alert"><h3>Chưa tải được hóa đơn</h3><p>{error}</p><button className="secondary" onClick={() => reload()}>Thử lại</button></div> : loading ? <div className="empty-state" role="status"><div className="spinner" /><p>Đang tải hóa đơn…</p></div> : data?.items.length ? <div className="table-scroll"><table><thead><tr><th>Hóa đơn</th><th>Khách hàng</th><th>Ngày lập / hạn thanh toán</th><th>Tổng tiền (VND)</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{data.items.map(invoice => <tr key={invoice.invoiceId}><td><span className="customer-code">{invoice.invoiceNumber ?? `Nháp #${invoice.invoiceId}`}</span><span className="subtext">{invoice.creatorName}</span></td><td>{invoice.customerName}<span className="subtext">{invoice.customerCode}</span></td><td>{invoice.invoiceDate.split('-').reverse().join('/')}<span className="subtext">Hạn: {invoice.dueDate.split('-').reverse().join('/')}</span></td><td className="amount">{money(invoice.totalAmount)}</td><td><span className={`badge ${invoice.issueStatus === 'Draft' ? 'draft' : invoice.issueStatus === 'Issued' ? 'active' : 'inactive'}`}>{statuses[invoice.issueStatus]}</span></td><td><button className="text-button" aria-label={`Xem hóa đơn ${invoice.invoiceId}`} onClick={() => setDetailId(invoice.invoiceId)}>Chi tiết ↗</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-symbol">▤</div><h3>{query.search || query.status ? 'Không có hóa đơn phù hợp' : 'Chưa có hóa đơn'}</h3><p>{query.search || query.status ? 'Thử từ khóa hoặc trạng thái khác.' : 'Bắt đầu bằng cách lập một bản nháp.'}</p>{(query.search || query.status) && <button className="secondary" onClick={() => { setTerm(''); reload('', 1, '') }}>Xóa bộ lọc</button>}</div>}
    <div className="pagination"><span>{data ? `${data.total} hóa đơn` : 'Danh sách hóa đơn'}</span><div><button className="page-button" aria-label="Hóa đơn trang trước" disabled={loading || !!error || query.page <= 1} onClick={() => reload(query.search, query.page - 1)}>‹</button><span>Trang {query.page} / {Math.max(1, Math.ceil((data?.total ?? 0) / 10))}</span><button className="page-button" aria-label="Hóa đơn trang sau" disabled={loading || !!error || query.page * 10 >= (data?.total ?? 0)} onClick={() => reload(query.search, query.page + 1)}>›</button></div></div></section>
    <footer className="page-footer"><span>FIN-05 · Hóa đơn và công nợ phải thu</span><span>Phát hành mô phỏng · Không gửi cơ quan thuế.</span></footer>
    {editor && <InvoiceEditor initial={editor.initial} onClose={() => setEditor(null)} onSaved={invoice => { setEditor(null); setTerm(''); setNotice(`Đã lưu bản nháp #${invoice.invoiceId}.`); reload('', 1, ''); setDetailId(invoice.invoiceId) }} />}
    {detailId !== null && <InvoiceDetails id={detailId} onClose={() => setDetailId(null)} onEdit={invoice => { setDetailId(null); setEditor({ initial: invoice }) }} onChanged={action => { setNotice(action === 'issue' ? 'Đã phát hành mô phỏng. Hóa đơn được đưa vào công nợ phải thu.' : 'Đã hủy bản nháp. Nội dung được giữ lại để truy vết.'); reload() }} />}
  </>
}
