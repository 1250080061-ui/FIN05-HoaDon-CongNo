import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Decimal from 'decimal.js'
import { ApiError, request } from './api'
import { canWriteReminders } from './auth'
import { money } from './invoices'
import { contactChannel, displayDate, reminderAction, reminderStatus } from './reminders'
import type { Reminder, ReminderDetail } from './reminders'

export function ReminderDetails({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [data, setData] = useState<ReminderDetail | null>(null)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [action, setAction] = useState<'contact' | 'close' | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal() }, [])
  useEffect(() => {
    const controller = new AbortController()
    request<ReminderDetail>(`/reminders/${id}`, { signal: controller.signal }).then(r => { setData(r); setError('') })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Không tải được nhắc nợ.') })
    return () => controller.abort()
  }, [id, revision])
  async function perform(event: FormEvent) {
    event.preventDefault()
    if (!data || !action || busy || !note.trim()) return
    setBusy(true); setError('')
    try {
      const result = await request<Reminder>(`/reminders/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowVersion: data.detail.rowVersion, note: note.trim() }) })
      setData(c => c ? { ...c, detail: result } : null); setAction(null); setNote('')
      setNotice(action === 'contact' ? 'Đã ghi nhận kết quả liên hệ thủ công.' : 'Đã đóng thông báo; lịch sử được giữ lại.'); onChanged()
      try { setData(await request<ReminderDetail>(`/reminders/${id}`)) } catch { setError('Đã lưu thành công nhưng chưa tải được lịch sử mới. Bấm Tải lại chi tiết để cập nhật.') }
    } catch (reason) { setError(reason instanceof ApiError ? [reason.message, ...Object.values(reason.errors).flat()].join(' ') : 'Chưa xác định được kết quả lưu. Hãy tải lại chi tiết trước khi thử lại.') }
    finally { setBusy(false) }
  }
  const r = data?.detail
  const paid = r ? new Decimal(r.remainingAmount).lte(0) : false
  return <dialog ref={dialog} className="modal invoice-modal" aria-labelledby="reminder-detail-title" onClose={onClose} onCancel={e => { if (busy) e.preventDefault() }}>
    <div className="modal-heading"><div><span className="eyebrow">LỊCH SỬ NHẮC NỢ</span><h2 id="reminder-detail-title">Nhắc nợ #{id}</h2></div><button className="close-button" disabled={busy} aria-label="Đóng chi tiết nhắc nợ" onClick={() => dialog.current?.close()}>×</button></div>
    <div className="invoice-form-body">{error && <div role="alert" className="notice error">{error}</div>}{notice && <div role="status" className="notice success">{notice}</div>}
      {r ? <><div className="payment-summary"><div><span className={`badge ${r.status === 'Closed' ? '' : 'active'}`}>{reminderStatus(r.status)}</span><h3>{r.customerName}</h3><p>{r.customerCode} · {r.invoiceNumber}</p><p>Hạn thanh toán: {displayDate(r.dueDate)} · Dự kiến liên hệ: {displayDate(r.scheduledDate)}</p><p>Người tạo: {r.creatorName} · {new Date(r.reminderDate).toLocaleString('vi-VN')}</p></div><div className="payment-amounts"><span>Số dư khi tạo: <strong>{money(r.balanceAtCreation)} VND</strong></span><span>Còn phải thu hiện tại: <strong>{money(r.remainingAmount)} VND</strong></span></div></div>
      {paid && r.status !== 'Closed' && <p className="notice success">Hóa đơn đã thanh toán đủ. Hãy đóng thông báo; lịch sử liên hệ vẫn được giữ lại.</p>}
      <h3>Nội dung nhắc nợ</h3><p>{contactChannel(r.contactChannel)}: {r.contactInfo}</p><div className="reminder-content">{r.content}</div>
      {r.contactedAt && <section className="reminder-result"><h3>Kết quả liên hệ</h3><span className="subtext">{new Date(r.contactedAt).toLocaleString('vi-VN')}</span><p>{r.contactNote}</p></section>}
      {r.closedAt && <section className="reminder-result"><h3>Lý do đóng</h3><span className="subtext">{new Date(r.closedAt).toLocaleString('vi-VN')}</span><p>{r.closeReason}</p></section>}
      {canWriteReminders() && r.status !== 'Closed' && !action && <div className="payment-tools">{r.status === 'Open' && !paid && <button className="primary" disabled={busy} onClick={() => setAction('contact')}>Ghi nhận đã liên hệ</button>}<button className="secondary" disabled={busy} onClick={() => setAction('close')}>Đóng thông báo</button></div>}
      {action && <form className="payment-confirm" onSubmit={perform}><h3>{action === 'contact' ? 'Ghi nhận kết quả liên hệ thực tế' : 'Xác nhận đóng thông báo'}</h3><p>{action === 'contact' ? 'Chỉ ghi nhận sau khi bạn đã thực hiện liên hệ. Thời điểm ghi nhận được hệ thống lưu lại.' : 'Thông báo sẽ kết thúc xử lý. Nội dung và các lần thao tác được giữ lại.'}</p><label htmlFor="reminder-action-note">{action === 'contact' ? 'Kết quả liên hệ *' : 'Lý do đóng *'}</label><textarea id="reminder-action-note" required maxLength={1000} rows={3} disabled={busy} value={note} onChange={e => setNote(e.target.value)} /><button type="button" className="secondary" disabled={busy} onClick={() => { setAction(null); setNote('') }}>Quay lại</button><button type="submit" className="primary" disabled={busy || !note.trim()}>{busy ? 'Đang lưu…' : action === 'contact' ? 'Xác nhận đã liên hệ' : 'Xác nhận đóng thông báo'}</button></form>}
      <h3>Lịch sử xử lý</h3><ol className="reminder-history">{data.history.map((h, i) => <li key={i}><strong>{reminderAction(h.action)}</strong><span>{h.actorName} · {new Date(h.actionTime).toLocaleString('vi-VN')}</span></li>)}</ol><p className="receivable-stage-note">Đây là ghi nhận nội bộ; hệ thống chưa gửi email hoặc tin nhắn tự động.</p>
      </> : !error && <p role="status">Đang tải nhắc nợ…</p>}
    </div><div className="modal-actions"><button className="text-button" disabled={busy} onClick={() => { setAction(null); setNote(''); setRevision(c => c + 1) }}>Tải lại chi tiết</button><button className="secondary" disabled={busy} onClick={() => dialog.current?.close()}>Đóng</button></div>
  </dialog>
}
