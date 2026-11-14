import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Decimal from 'decimal.js'
import { apiResponse, request } from './api'
import type { Customer, CustomerPage } from './api'
import { canReadReports } from './auth'
import { Workspace } from './Workspace'
import { money } from './invoices'
import { displayDate } from './reminders'
import { reportName, reportParams } from './reports'
import type { Report, ReportFilters, ReportType } from './reports'

const initialFilters: ReportFilters = { type: 'Receivables', search: '', customerId: '', fromDate: '', toDate: '' }
export function ReportsPage() {
  return <Workspace section="reports">{canReadReports() ? <Reports /> : <div className="empty-state"><h1>Không có quyền xem báo cáo</h1><p>Chức năng dành cho kế toán, ban quản lý và quản trị viên.</p><a href="/">Về khách hàng</a></div>}</Workspace>
}
function Reports() {
  const [filters, setFilters] = useState(initialFilters)
  const [query, setQuery] = useState({ filters: initialFilters, customerLabel: 'Tất cả khách hàng', page: 1, revision: 0 })
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  const exportController = useRef<AbortController | null>(null)
  const [customerTerm, setCustomerTerm] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selected, setSelected] = useState<Customer | null>(null)
  const [lookupError, setLookupError] = useState('')
  useEffect(() => () => exportController.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    request<CustomerPage>(`/customers?pageSize=20&search=${encodeURIComponent(customerTerm)}`, { signal: controller.signal })
      .then(r => { setCustomers(r.items); setLookupError('') })
      .catch(e => { if (!controller.signal.aborted) setLookupError(e instanceof Error ? e.message : 'Không tải được khách hàng.') })
    return () => controller.abort()
  }, [customerTerm])
  useEffect(() => {
    const controller = new AbortController()
    request<Report>(`/reports?${reportParams(query.filters, query.page)}`, { signal: controller.signal })
      .then(r => { setData(r); setError('') })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Không lập được báo cáo.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query])
  function change(field: keyof ReportFilters, value: string) { setFilters(c => ({ ...c, [field]: value })) }
  function show(e: FormEvent) {
    e.preventDefault(); if (exporting) return
    setLoading(true); setError(''); setExportError(''); setNotice('')
    setQuery(c => ({ filters: { ...filters, search: filters.search.trim() }, customerLabel: selected ? `${selected.customerCode} · ${selected.customerName}` : 'Tất cả khách hàng', page: 1, revision: c.revision + 1 }))
  }
  function reload(page = query.page) { setLoading(true); setError(''); setExportError(''); setNotice(''); setQuery(c => ({ ...c, page, revision: c.revision + 1 })) }
  async function download() {
    if (!data || loading || exporting || error) return
    setExporting(true); setExportError(''); setNotice('')
    const controller = new AbortController(); exportController.current = controller
    try {
      const response = await apiResponse(`/reports/export?${reportParams(query.filters)}`, { signal: controller.signal })
      const blob = await response.blob(), url = URL.createObjectURL(blob)
      const filename = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] ?? `FIN05-${query.filters.type}.csv`
      const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('Đã xuất CSV theo bộ lọc đã áp dụng; file ghi thời điểm tổng hợp riêng lúc xuất.')
    } catch (e) { if (!controller.signal.aborted) setExportError(e instanceof Error ? e.message : 'Không xuất được CSV. Bạn có thể thử lại.') }
    finally { if (!controller.signal.aborted) setExporting(false) }
  }
  const collections = query.filters.type === 'Collections', dirty = JSON.stringify(filters) !== JSON.stringify(query.filters)
  const s = data?.summary
  const cards = collections ? [ ['Đã thu (VND)', s?.collectedAmount], ['Đã phân bổ hiện tại (VND)', s?.allocatedAmount], ['Chưa phân bổ (VND)', s?.unallocatedAmount] ]
    : [ ['Còn phải thu (VND)', s?.remainingAmount], ['Quá hạn (VND)', s?.overdueAmount], ['Giá trị hóa đơn gốc (VND)', s?.originalAmount], ['Điều chỉnh hiệu lực (VND)', s?.adjustmentAmount], ['Đã phân bổ (VND)', s?.allocatedAmount] ]
  return <><div className="breadcrumb">Theo dõi <span>/</span><strong>Báo cáo thống kê</strong></div><div className="page-heading"><div><div className="eyebrow">SỐ LIỆU & ĐỐI CHIẾU</div><h1>Báo cáo thống kê</h1><p>Công nợ, hóa đơn quá hạn và thu tiền theo phạm vi đã chọn.</p></div></div>
    <section className="customer-panel report-filters" aria-labelledby="report-filters-title"><div className="panel-heading"><h2 id="report-filters-title">Điều kiện báo cáo</h2><span className="panel-caption">Đơn vị: VND</span></div>
      <form onSubmit={show}><fieldset disabled={exporting}><div className="report-filter-grid"><label htmlFor="report-type">Loại báo cáo<select id="report-type" value={filters.type} onChange={e => change('type', e.target.value as ReportType)}><option value="Receivables">Công nợ hiện tại</option><option value="Overdue">Hóa đơn quá hạn</option><option value="Collections">Thu tiền</option></select></label><label htmlFor="report-search">Từ khóa<input id="report-search" maxLength={200} value={filters.search} onChange={e => change('search', e.target.value)} placeholder="Số chứng từ, mã hoặc tên khách hàng" /></label>
      <label htmlFor="report-from">{filters.type === 'Collections' ? 'Ngày thu từ' : 'Hạn thanh toán từ'}<input id="report-from" type="date" value={filters.fromDate} onChange={e => change('fromDate', e.target.value)} /></label><label htmlFor="report-to">Đến ngày<input id="report-to" type="date" min={filters.fromDate || undefined} value={filters.toDate} onChange={e => change('toDate', e.target.value)} /></label>
      <label htmlFor="report-customer-search">Tìm khách hàng để chọn<input id="report-customer-search" maxLength={200} value={customerTerm} onChange={e => setCustomerTerm(e.target.value)} placeholder="Tối đa 20 kết quả; gồm khách ngừng hoạt động" /></label><label htmlFor="report-customer">Khách hàng<select id="report-customer" value={filters.customerId} onChange={e => { const value = e.target.value; change('customerId', value); setSelected(customers.find(c => c.customerId === Number(value)) ?? null) }}><option value="">Tất cả khách hàng</option>{selected && !customers.some(c => c.customerId === selected.customerId) && <option value={selected.customerId}>{selected.customerCode} — {selected.customerName}</option>}{customers.map(c => <option key={c.customerId} value={c.customerId}>{c.customerCode} — {c.customerName}</option>)}</select></label></div>
      {lookupError && <p role="alert" className="field-error">{lookupError}</p>}<div className="report-filter-actions"><button className="primary" type="submit" disabled={loading}>Xem báo cáo</button><button className="secondary" type="button" disabled={loading} onClick={() => { setFilters(initialFilters); setSelected(null); setCustomerTerm(''); setLoading(true); setError(''); setNotice(''); setExportError(''); setQuery(c => ({ filters: initialFilters, customerLabel: 'Tất cả khách hàng', page: 1, revision: c.revision + 1 })) }}>Xóa bộ lọc</button>{dirty && <span className="subtext">Bộ lọc mới chưa áp dụng. Bấm Xem báo cáo để cập nhật.</span>}</div></fieldset></form>
    </section>
    <div className="report-scope"><strong>{reportName(query.filters.type)}</strong><span>{query.customerLabel} · {collections ? 'Ngày thu' : 'Hạn thanh toán'}: {query.filters.fromDate ? displayDate(query.filters.fromDate) : 'không giới hạn'} → {query.filters.toDate ? displayDate(query.filters.toDate) : 'không giới hạn'}</span><span>{query.filters.search ? `Từ khóa: ${query.filters.search} · ` : ''}{data && !loading && !error ? `Lập lúc ${new Date(data.generatedAt).toLocaleString('vi-VN')} · Ngày nghiệp vụ ${displayDate(data.asOfDate)}` : 'Đang tổng hợp số liệu'}</span></div>
    <p className="receivable-stage-note">{collections ? 'Chỉ phiếu thu đã xác nhận trong khoảng ngày thu. Số đã/chưa phân bổ là trạng thái hiện tại của những phiếu này, kể cả phân bổ thực hiện ngoài khoảng ngày chọn.' : 'Chỉ hóa đơn đã phát hành theo hạn thanh toán được chọn. Số dư hiện tại = giá trị gốc + điều chỉnh có hiệu lực − tiền đã phân bổ.'} Đây không phải báo cáo số dư tại một ngày quá khứ.</p>
    {notice && <div className="notice success" role="status">{notice}</div>}{exportError && <div className="notice error" role="alert">{exportError}</div>}
    <div className="report-stats" aria-label="Tổng cộng toàn bộ dữ liệu theo bộ lọc">{cards.map(([label, value]) => <div key={label}><span>{label}</span><strong>{!loading && !error && value ? money(value) : '—'}</strong></div>)}<div><span>{collections ? 'Số phiếu thu' : 'Số hóa đơn'}</span><strong>{!loading && !error && data ? data.total : '—'}</strong></div></div>
    {!collections && data && !loading && !error && <section className="report-aging" aria-labelledby="report-aging-title"><h2 id="report-aging-title">Tuổi nợ theo số dư hiện tại</h2><div>{data.aging.map(b => <div className="aging-row" key={b.bucket}><span>{b.label}<small>{b.count} hóa đơn còn dư</small></span><span className="aging-track" aria-hidden="true"><i style={{ width: `${new Decimal(data.summary.remainingAmount).gt(0) ? new Decimal(b.amount).div(data.summary.remainingAmount).mul(100).toNumber() : 0}%` }} /></span><strong>{money(b.amount)}</strong></div>)}</div></section>}
    <section className="customer-panel" aria-labelledby="report-results-title"><div className="panel-heading"><h2 id="report-results-title">Chi tiết báo cáo</h2><div className="report-result-actions"><button className="text-button" disabled={loading || exporting} onClick={() => reload()}>↻ Tải lại</button><button className="secondary" disabled={loading || exporting || !!error || !data} onClick={() => void download()}>{exporting ? 'Đang xuất…' : 'Xuất CSV'}</button></div></div><p className="report-export-note">CSV xuất toàn bộ kết quả theo bộ lọc đã áp dụng, tối đa 10.000 dòng; dữ liệu được tổng hợp lại tại thời điểm xuất.</p>
      {error ? <div role="alert" className="empty-state"><h3>Chưa lập được báo cáo</h3><p>{error}</p><button className="secondary" onClick={() => reload()}>Thử lại</button></div> : loading ? <div className="empty-state" role="status"><div className="spinner" /><p>Đang tổng hợp báo cáo…</p></div> : !data?.items.length ? <div className="empty-state"><h3>Không có dữ liệu phù hợp</h3><p>Thử đổi loại báo cáo hoặc điều kiện lọc. Tổng cộng bằng 0 khi không có kết quả.</p></div> : <div className="table-scroll"><table><thead><tr><th>{collections ? 'Phiếu thu' : 'Hóa đơn'}</th><th>Khách hàng</th><th>{collections ? 'Ngày thu / Phương thức' : 'Hạn thanh toán'}</th>{collections ? <><th>Đã thu</th><th>Đã phân bổ hiện tại</th><th>Chưa phân bổ</th></> : <><th>Giá trị gốc</th><th>Điều chỉnh hiệu lực</th><th>Đã phân bổ</th><th>Còn phải thu</th><th>Quá hạn</th></>}</tr></thead><tbody>{data.items.map(r => <tr key={r.id}><td><span className="customer-code">{r.number}</span></td><td>{r.customerName}<span className="subtext">{r.customerCode}</span></td><td>{displayDate(r.date)}{collections && <span className="subtext">{r.paymentMethod === 'Cash' ? 'Tiền mặt' : 'Chuyển khoản'}</span>}</td>{collections ? <><td className="amount">{money(r.collectedAmount)}</td><td className="amount">{money(r.allocatedAmount)}</td><td className="amount">{money(r.unallocatedAmount)}</td></> : <><td className="amount">{money(r.originalAmount)}</td><td className="amount">{money(r.adjustmentAmount)}</td><td className="amount">{money(r.allocatedAmount)}</td><td className="amount">{money(r.remainingAmount)}</td><td>{r.overdueDays ? <span className="badge overdue">{r.overdueDays} ngày</span> : '—'}</td></>}</tr>)}</tbody></table></div>}
      <div className="pagination"><span>Tổng {data?.total ?? 0} {collections ? 'phiếu thu' : 'hóa đơn'} · Tổng cộng tính trên tất cả các trang</span><div><button className="page-button" disabled={loading || exporting || !!error || query.page <= 1} aria-label="Báo cáo trang trước" onClick={() => reload(query.page - 1)}>‹</button><span>Trang {query.page} / {Math.max(1, Math.ceil((data?.total ?? 0) / 10))}</span><button className="page-button" disabled={loading || exporting || !!error || query.page * 10 >= (data?.total ?? 0)} aria-label="Báo cáo trang sau" onClick={() => reload(query.page + 1)}>›</button></div></div>
    </section><footer className="page-footer"><span>FIN-05 · Báo cáo thống kê</span><span>Chỉ tra cứu · Số liệu hiện tại theo phạm vi đã chọn</span></footer>
  </>
}
