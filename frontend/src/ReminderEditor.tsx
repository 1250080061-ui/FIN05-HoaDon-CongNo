import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, request } from './api'
import { money } from './invoices'
import { contactChannel, displayDate } from './reminders'
import type { Reminder, ReminderCandidate } from './reminders'

export function ReminderEditor({ candidate, asOfDate, onClose, onSaved }: { candidate: ReminderCandidate; asOfDate: string; onClose: () => void; onSaved: (r: Reminder) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [scheduledDate, setScheduledDate] = useState(asOfDate)
  const [channel, setChannel] = useState(candidate.phone ? 'Phone' : candidate.email ? 'Email' : 'Phone')
  const [info, setInfo] = useState(candidate.phone ?? candidate.email ?? '')
  const [content, setContent] = useState(`Kính gửi ${candidate.customerName}, hóa đơn ${candidate.invoiceNumber} có hạn thanh toán ngày ${displayDate(candidate.dueDate)}, hiện còn phải thu ${money(candidate.remainingAmount)} VND. Đề nghị quý khách kiểm tra và phản hồi kế hoạch thanh toán. Xin cảm ơn.`)
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal() }, [])
  function changeChannel(value: string) { setChannel(value); setInfo(value === 'Phone' ? candidate.phone ?? '' : value === 'Email' ? candidate.email ?? '' : '') }
  async function save() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const r = await request<Reminder>('/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: candidate.invoiceId, invoiceRowVersion: candidate.invoiceRowVersion,
          scheduledDate, content: content.trim(), contactChannel: channel, contactInfo: info.trim() }) })
      onSaved(r)
    } catch (reason) {
      setError(reason instanceof ApiError ? [reason.message, ...Object.values(reason.errors).flat()].join(' ') : 'Không kết nối được máy chủ. Hãy kiểm tra danh sách trước khi tạo lại.')
    } finally { setBusy(false) }
  }
  function check(event: FormEvent) { event.preventDefault(); if (content.trim() && info.trim()) setReview(true) }
  return <dialog ref={dialog} className="modal invoice-modal" aria-labelledby="reminder-editor-title" onClose={onClose} onCancel={e => { if (busy) e.preventDefault() }}>
    <div className="modal-heading"><div><span className="eyebrow">{candidate.invoiceNumber}</span><h2 id="reminder-editor-title">Lập nhắc nợ</h2></div><button className="close-button" disabled={busy} aria-label="Đóng lập nhắc nợ" onClick={() => dialog.current?.close()}>×</button></div>
    <div className="invoice-form-body"><div className="reminder-invoice"><strong>{candidate.customerName}</strong><p>{candidate.customerCode} · Hạn: {displayDate(candidate.dueDate)}</p><p>Còn phải thu: <strong>{money(candidate.remainingAmount)} VND</strong></p><span className={`badge ${candidate.isOverdue ? 'overdue' : 'active'}`}>{candidate.isOverdue ? `Quá hạn ${candidate.overdueDays} ngày` : 'Đến hạn trong 7 ngày'}</span></div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {!review ? <form id="reminder-create-form" onSubmit={check}><div className="form-grid">
        <label htmlFor="reminder-scheduled">Ngày dự kiến liên hệ *<input id="reminder-scheduled" type="date" required min={asOfDate} value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} /><span className="subtext">Từ hôm nay đến 30 ngày tới.</span></label>
        <label htmlFor="reminder-channel">Kênh liên hệ *<select id="reminder-channel" value={channel} onChange={e => changeChannel(e.target.value)}><option value="Phone">Điện thoại</option><option value="Email">Email</option><option value="Other">Khác</option></select></label>
        <label className="full-width" htmlFor="reminder-contact-info">Thông tin liên hệ *<input id="reminder-contact-info" type={channel === 'Email' ? 'email' : 'text'} required maxLength={254} value={info} onChange={e => setInfo(e.target.value)} placeholder="Số điện thoại, email hoặc thông tin liên hệ thực tế" /></label>
        <label className="full-width" htmlFor="reminder-content">Nội dung nhắc nợ *<textarea id="reminder-content" aria-label="Nội dung nhắc nợ" required rows={6} maxLength={4000} value={content} onChange={e => setContent(e.target.value)} /></label>
      </div></form> : <section className="payment-confirm" aria-label="Kiểm tra nhắc nợ"><h3>Kiểm tra trước khi lưu</h3><p>{contactChannel(channel)}: {info}<br />Dự kiến: {displayDate(scheduledDate)}</p><div className="reminder-content">{content}</div><p>Thao tác này lưu thông báo nội bộ; nhân viên thực hiện liên hệ và ghi nhận kết quả sau.</p></section>}
      <p className="receivable-stage-note">Chưa gửi email hoặc tin nhắn tự động. Nội dung mẫu cần được bạn kiểm tra và chỉnh phù hợp trước khi liên hệ.</p>
    </div><div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => review ? setReview(false) : dialog.current?.close()}>{review ? 'Quay lại chỉnh' : 'Hủy'}</button>{review ? <button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Xác nhận tạo nhắc nợ'}</button> : <button className="primary" type="submit" form="reminder-create-form" disabled={!content.trim() || !info.trim()}>Kiểm tra nhắc nợ</button>}</div>
  </dialog>
}
