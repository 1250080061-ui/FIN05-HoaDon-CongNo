import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Decimal from 'decimal.js'
import { ApiError, request } from './api'
import { canWriteAdjustments } from './auth'
import { money } from './invoices'
import { displayDate } from './reminders'
import { adjustmentAction, adjustmentStatus } from './adjustments'
import type { Adjustment, AdjustmentDetail, AdjustmentLine } from './adjustments'

export function JournalLines({ lines }: { lines: AdjustmentLine[] }) {
  return <div className="table-scroll"><table><thead><tr><th>Tài khoản</th><th>Nợ (VND)</th><th>Có (VND)</th></tr></thead><tbody>{lines.map((l, i) => <tr key={i}><td>{l.accountCode}<span className="subtext">{l.accountName}</span></td><td className="amount">{money(l.debitAmount)}</td><td className="amount">{money(l.creditAmount)}</td></tr>)}</tbody></table></div>
}
export function AdjustmentDetails({ id, onClose, onEdit, onChanged }: { id: number; onClose: () => void; onEdit: (a: Adjustment) => void; onChanged: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [data, setData] = useState<AdjustmentDetail | null>(null)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [action, setAction] = useState<'post' | 'reverse' | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal() }, [])
  useEffect(() => {
    const controller = new AbortController()
    request<AdjustmentDetail>(`/adjustments/${id}`, { signal: controller.signal }).then(r => { setData(r); setError('') })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Không tải được điều chỉnh.') })
    return () => controller.abort()
  }, [id, revision])
  async function perform(e: FormEvent) {
    e.preventDefault()
    if (!data || !action || busy || action === 'reverse' && !note.trim()) return
    setBusy(true); setError('')
    try {
      const a = await request<Adjustment>(`/adjustments/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowVersion: data.detail.rowVersion, invoiceRowVersion: data.detail.invoiceRowVersion, ...(action === 'reverse' ? { note: note.trim() } : {}) }) })
      setData(c => c ? { ...c, detail: a } : null); setAction(null); setNote(''); onChanged()
      setNotice(action === 'post' ? 'Đã ghi nhận điều chỉnh, chứng từ đối ứng và công nợ.' : 'Đã tạo chứng từ đảo; chứng từ gốc và lịch sử được giữ lại.')
      try { setData(await request<AdjustmentDetail>(`/adjustments/${id}`)) } catch { setError('Đã lưu thành công nhưng chưa tải lại lịch sử. Bấm Tải lại chi tiết để cập nhật.') }
    } catch (e) { setError(e instanceof ApiError ? [e.message, ...Object.values(e.errors).flat()].join(' ') : 'Chưa xác định được kết quả. Hãy tải lại chi tiết trước khi thử lại.') }
    finally { setBusy(false) }
  }
  const a = data?.detail
  const next = a && action ? new Decimal(a.remainingAmount).plus(action === 'post' ? a.signedAmount : new Decimal(a.signedAmount).negated()).toFixed(2) : null
  const canPerform = next !== null && new Decimal(next).gte(0) && new Decimal(next).lte('9999999999999999.99')
  return <dialog ref={dialog} className="modal invoice-modal" aria-labelledby="adjustment-detail-title" onClose={onClose} onCancel={e => { if (busy) e.preventDefault() }}>
    <div className="modal-heading"><div><span className="eyebrow">ĐIỀU CHỈNH CÔNG NỢ</span><h2 id="adjustment-detail-title">Điều chỉnh #{id}</h2></div><button className="close-button" disabled={busy} aria-label="Đóng chi tiết điều chỉnh" onClick={() => dialog.current?.close()}>×</button></div>
    <div className="invoice-form-body">{error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice success" role="status">{notice}</div>}
      {a ? <><div className="payment-summary"><div><span className={`badge ${a.status === 'Posted' ? 'active' : ''}`}>{adjustmentStatus(a.status)}</span><h3>{a.customerName}</h3><p>{a.customerCode} · {a.invoiceNumber}</p><p>Ngày điều chỉnh: {displayDate(a.adjustmentDate)}</p><p>Người lập: {a.creatorName} · {new Date(a.createdAt).toLocaleString('vi-VN')}</p></div><div className="payment-amounts"><span>Giá trị hóa đơn gốc: <strong>{money(a.originalAmount)} VND</strong></span><span>Điều chỉnh có dấu: <strong>{money(a.signedAmount)} VND</strong></span><span>Còn phải thu hiện tại: <strong>{money(a.remainingAmount)} VND</strong></span></div></div>
      <h3>Lý do điều chỉnh</h3><div className="reminder-content">{a.reason}</div>
      {a.status === 'Draft' && <><h3>Bút toán dự kiến</h3><JournalLines lines={a.lines} /><p className="receivable-stage-note">Bản nháp chưa tạo chứng từ chính thức và chưa ảnh hưởng công nợ.</p></>}
      {canWriteAdjustments() && !action && <div className="payment-tools">{a.status === 'Draft' && <><button className="secondary" disabled={busy} onClick={() => onEdit(a)}>Sửa điều chỉnh nháp</button><button className="primary" disabled={busy} onClick={() => setAction('post')}>Ghi nhận điều chỉnh</button></>}{a.status === 'Posted' && <button className="secondary" disabled={busy} onClick={() => setAction('reverse')}>Đảo điều chỉnh</button>}</div>}
      {action && <form className="payment-confirm" onSubmit={perform}><h3>{action === 'post' ? 'Kiểm tra trước khi ghi nhận' : 'Kiểm tra trước khi đảo'}</h3><p>Số dư hiện tại: {money(a.remainingAmount)} VND<br />Sau thao tác: <strong>{money(next!)} VND</strong></p><p>{action === 'post' ? 'Hệ thống sẽ tạo chứng từ cân bằng Nợ – Có và khóa sửa điều chỉnh.' : 'Hệ thống sẽ đổi bên Nợ/Có của từng dòng chứng từ gốc, lưu chứng từ đảo và giữ lịch sử.'}</p>{!canPerform && <p role="alert" className="field-error">Số dư sau thao tác không hợp lệ. Hãy đối chiếu tiền đã phân bổ và các điều chỉnh khác.</p>}{action === 'reverse' && <><label htmlFor="adjustment-reversal-note">Lý do đảo *</label><textarea id="adjustment-reversal-note" required maxLength={500} rows={3} value={note} disabled={busy} onChange={e => setNote(e.target.value)} /></>}<button className="secondary" type="button" disabled={busy} onClick={() => setAction(null)}>Quay lại</button><button className="primary" type="submit" disabled={busy || !canPerform || action === 'reverse' && !note.trim()}>{busy ? 'Đang lưu…' : action === 'post' ? 'Xác nhận ghi nhận' : 'Xác nhận đảo điều chỉnh'}</button></form>}
      {a.journalEntries.map(entry => <section className="journal-entry" key={entry.journalEntryId}><h3>{entry.entryType === 'Original' ? 'Chứng từ gốc' : 'Chứng từ đảo'} #{entry.journalEntryId}</h3><p>{entry.actorName} · Ngày {displayDate(entry.entryDate)} · {new Date(entry.postedAt).toLocaleString('vi-VN')}</p><JournalLines lines={entry.lines} /><div className="journal-total">Tổng Nợ: {money(entry.totalDebit)} VND · Tổng Có: {money(entry.totalCredit)} VND</div></section>)}
      {a.reversalReason && <div className="reminder-result"><h3>Lý do đảo</h3><p>{a.reversalReason}</p></div>}
      <h3>Lịch sử xử lý</h3><ol className="reminder-history">{data.history.map((h, i) => <li key={i}><strong>{adjustmentAction(h.action)}</strong><span>{h.actorName} · {new Date(h.actionTime).toLocaleString('vi-VN')}</span></li>)}</ol>
      </> : !error && <p role="status">Đang tải điều chỉnh…</p>}
    </div><div className="modal-actions"><button className="text-button" disabled={busy} onClick={() => { setAction(null); setRevision(c => c + 1) }}>Tải lại chi tiết</button><button className="secondary" disabled={busy} onClick={() => dialog.current?.close()}>Đóng</button></div>
  </dialog>
}
