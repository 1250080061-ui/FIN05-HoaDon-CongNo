import { useEffect, useState } from 'react'
import { request } from './api'
import { canReadReminders, canWriteReminders } from './auth'
import { Workspace } from './Workspace'
import { ReminderEditor } from './ReminderEditor'
import { ReminderDetails } from './ReminderDetails'
import { displayDate, reminderStatus } from './reminders'
import type { ReminderCandidate, Reminder } from './reminders'
import { money } from './invoices'

type Query = { tab: 'candidates' | 'history'; search: string; due: string; status: string; from: string; to: string; invoiceId: number | null; page: number; revision: number }
type CandidatePage = { items: ReminderCandidate[]; total: number; asOfDate: string }
type HistoryPage = { items: Reminder[]; total: number }
export function RemindersPage() {
  return <Workspace section="reminders">{canReadReminders() ? <Reminders /> : <div className="empty-state"><h1>Không có quyền xem nhắc nợ</h1><p>Chức năng dành cho kế toán, quản lý và quản trị viên.</p><a href="/">Về khách hàng</a></div>}</Workspace>
}
function Reminders() {
  const [query, setQuery] = useState<Query>({ tab: 'candidates', search: '', due: 'All', status: '', from: '', to: '', invoiceId: null, page: 1, revision: 0 })
  const [term, setTerm] = useState('')
  const [candidates, setCandidates] = useState<CandidatePage | null>(null)
  const [history, setHistory] = useState<HistoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState<ReminderCandidate | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ search: query.search, page: String(query.page), pageSize: '10' })
    if (query.tab === 'candidates') params.set('due', query.due)
    else {
      if (query.status) params.set('status', query.status)
      if (query.from) params.set('fromDate', query.from)
      if (query.to) params.set('toDate', query.to)
      if (query.invoiceId) params.set('invoiceId', String(query.invoiceId))
    }
    const path = query.tab === 'candidates' ? '/reminders/candidates' : '/reminders'
    request<CandidatePage | HistoryPage>(`${path}?${params}`, { signal: controller.signal })
      .then(result => { if (query.tab === 'candidates') setCandidates(result as CandidatePage); else setHistory(result as HistoryPage); setError('') })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Không tải được nhắc nợ.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query])
  function reload(change: Partial<Query> = {}) { setLoading(true); setError(''); setQuery(c => ({ ...c, ...change, revision: c.revision + 1 })) }
  const candidateTab = query.tab === 'candidates'
  const count = (candidateTab ? candidates?.total : history?.total) ?? 0
  function showHistory(invoiceId: number) { setTerm(''); reload({ tab: 'history', invoiceId, search: '', status: '', from: '', to: '', page: 1 }) }
  return <><div className="breadcrumb">Nghiệp vụ <span>/</span><strong>Nhắc nợ</strong></div><div className="page-heading"><div><div className="eyebrow">THEO DÕI LIÊN HỆ KHÁCH HÀNG</div><h1>Nhắc nợ</h1><p>Hóa đơn còn phải thu, đã quá hạn hoặc đến hạn trong 7 ngày tới.</p></div><span className="as-of-date">{candidates ? `Ngày nghiệp vụ ${displayDate(candidates.asOfDate)}` : 'Ngày nghiệp vụ tại Việt Nam'}</span></div>
    {notice && <div className="notice success" role="status">{notice}</div>}
    <div className="reminder-tabs" aria-label="Chọn danh sách nhắc nợ"><button className={candidateTab ? 'primary' : 'secondary'} aria-pressed={candidateTab} onClick={() => reload({ tab: 'candidates', page: 1 })}>Hóa đơn cần nhắc</button><button className={!candidateTab ? 'primary' : 'secondary'} aria-pressed={!candidateTab} onClick={() => reload({ tab: 'history', invoiceId: null, page: 1 })}>Lịch sử nhắc nợ</button></div>
    <section className="customer-panel" aria-labelledby="reminder-list-title"><div className="panel-heading"><h2 id="reminder-list-title">{candidateTab ? 'Hóa đơn cần nhắc' : 'Lịch sử nhắc nợ'}</h2><span className="panel-caption">{candidateTab ? 'Số dư được kiểm tra lại khi lưu' : 'Giữ lịch sử sau khi thanh toán'}</span></div>
      <div className="toolbar reminder-toolbar"><form role="search" onSubmit={e => { e.preventDefault(); reload({ search: term.trim(), page: 1 }) }}><div className="search-input"><span aria-hidden="true">⌕</span><label className="sr-only" htmlFor="reminder-search">Tìm nhắc nợ</label><input id="reminder-search" value={term} maxLength={200} onChange={e => setTerm(e.target.value)} placeholder="Tìm hóa đơn, mã hoặc tên khách hàng…" /></div>
      {candidateTab ? <><label className="sr-only" htmlFor="reminder-due-filter">Lọc thời hạn nhắc nợ</label><select id="reminder-due-filter" value={query.due} onChange={e => reload({ due: e.target.value, page: 1 })}><option value="All">Tất cả thời hạn</option><option value="Overdue">Đã quá hạn</option><option value="Upcoming">Đến hạn trong 7 ngày</option></select></> : <><label className="sr-only" htmlFor="reminder-status-filter">Trạng thái nhắc nợ</label><select id="reminder-status-filter" value={query.status} onChange={e => reload({ status: e.target.value, page: 1 })}><option value="">Tất cả trạng thái</option><option value="Open">Mới tạo</option><option value="Contacted">Đã liên hệ</option><option value="Closed">Đã đóng</option></select></>}
      <button className="secondary" type="submit">Tìm kiếm</button></form><button className="text-button" disabled={loading} onClick={() => reload()}>↻ Tải lại</button></div>
      {!candidateTab && <div className="reminder-date-filter"><label htmlFor="reminder-from">Dự kiến từ<input type="date" id="reminder-from" value={query.from} onChange={e => reload({ from: e.target.value, page: 1 })} /></label><label htmlFor="reminder-to">Đến ngày<input type="date" id="reminder-to" value={query.to} onChange={e => reload({ to: e.target.value, page: 1 })} /></label>{query.invoiceId && <button className="text-button" onClick={() => reload({ invoiceId: null, page: 1 })}>Xóa lọc hóa đơn #{query.invoiceId}</button>}</div>}
      {error ? <div role="alert" className="empty-state"><p>{error}</p><button className="secondary" onClick={() => reload()}>Thử lại</button></div> : loading ? <div role="status" className="empty-state"><div className="spinner" /><p>Đang tải danh sách…</p></div> : count === 0 ? <div className="empty-state"><div className="empty-symbol">◷</div><h3>{candidateTab ? 'Không có hóa đơn cần nhắc phù hợp' : 'Chưa có nhắc nợ phù hợp'}</h3><p>{candidateTab ? 'Chỉ lấy hóa đơn đã phát hành còn số dư, đến hạn trong 7 ngày hoặc quá hạn.' : 'Lịch sử được tạo khi kế toán lưu thông báo nhắc nợ.'}</p></div> : <div className="table-scroll"><table><thead>{candidateTab ? <tr><th>Hóa đơn / Khách hàng</th><th>Hạn thanh toán</th><th>Còn phải thu (VND)</th><th>Thời hạn</th><th><span className="sr-only">Thao tác</span></th></tr> : <tr><th>Nhắc nợ / Hóa đơn</th><th>Khách hàng</th><th>Dự kiến liên hệ</th><th>Còn phải thu (VND)</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr>}</thead><tbody>
        {candidateTab ? candidates?.items.map(c => <tr key={c.invoiceId}><td><span className="customer-code">{c.invoiceNumber}</span><span className="subtext">{c.customerCode} · {c.customerName}</span></td><td>{displayDate(c.dueDate)}</td><td className="amount">{money(c.remainingAmount)}</td><td><span className={`badge ${c.isOverdue ? 'overdue' : 'active'}`}>{c.isOverdue ? `Quá hạn ${c.overdueDays} ngày` : c.dueDate === candidates.asOfDate ? 'Đến hạn hôm nay' : 'Sắp đến hạn'}</span></td><td><div className="reminder-row-actions">{c.activeReminderId ? <button className="text-button" onClick={() => setDetailId(c.activeReminderId)}>Đang xử lý #{c.activeReminderId}</button> : canWriteReminders() && <button className="text-button" aria-label={`Lập nhắc nợ ${c.invoiceNumber}`} onClick={() => setEditor(c)}>Lập nhắc nợ</button>}<button className="text-button" aria-label={`Lịch sử nhắc ${c.invoiceNumber}`} onClick={() => showHistory(c.invoiceId)}>Lịch sử ↗</button></div></td></tr>) : history?.items.map(r => <tr key={r.reminderId}><td><span className="customer-code">#{r.reminderId}</span><span className="subtext">{r.invoiceNumber}</span></td><td>{r.customerName}<span className="subtext">{r.customerCode}</span></td><td>{displayDate(r.scheduledDate)}</td><td className="amount">{money(r.remainingAmount)}</td><td><span className={`badge ${r.status === 'Closed' ? '' : 'active'}`}>{reminderStatus(r.status)}</span></td><td><button className="text-button" aria-label={`Xem nhắc nợ ${r.reminderId}`} onClick={() => setDetailId(r.reminderId)}>Chi tiết ↗</button></td></tr>)}
      </tbody></table></div>}
      <div className="pagination"><span>{count} {candidateTab ? 'hóa đơn' : 'thông báo'}</span><div><button className="page-button" aria-label="Nhắc nợ trang trước" disabled={loading || !!error || query.page <= 1} onClick={() => reload({ page: query.page - 1 })}>‹</button><span>Trang {query.page} / {Math.max(1, Math.ceil(count / 10))}</span><button className="page-button" aria-label="Nhắc nợ trang sau" disabled={loading || !!error || query.page * 10 >= count} onClick={() => reload({ page: query.page + 1 })}>›</button></div></div>
    </section><p className="receivable-stage-note">Mỗi hóa đơn có tối đa một nhắc nợ đang xử lý. “Đã liên hệ” là kết quả do nhân viên ghi nhận thủ công; hệ thống chưa gửi email hoặc tin nhắn tự động.</p><footer className="page-footer"><span>FIN-05 · Quản lý nhắc nợ</span><span>Lịch sử được giữ nguyên khi đóng thông báo</span></footer>
    {editor && candidates && <ReminderEditor candidate={editor} asOfDate={candidates.asOfDate} onClose={() => setEditor(null)} onSaved={r => { setEditor(null); setDetailId(r.reminderId); setNotice('Đã tạo thông báo nhắc nợ nội bộ.'); reload() }} />}
    {detailId !== null && <ReminderDetails key={detailId} id={detailId} onClose={() => setDetailId(null)} onChanged={() => { setNotice(''); reload() }} />}
  </>
}
