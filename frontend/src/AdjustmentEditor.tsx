import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Decimal from 'decimal.js'
import { ApiError, request } from './api'
import { money } from './invoices'
import type { AccountingAccount, Adjustment, AdjustmentInvoice, AdjustmentLine } from './adjustments'

export function AdjustmentEditor({ invoice, asOfDate, initial, onClose, onSaved }: { invoice: AdjustmentInvoice; asOfDate: string; initial?: Adjustment; onClose: () => void; onSaved: (a: Adjustment) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [accounts, setAccounts] = useState<AccountingAccount[]>([])
  const [accountError, setAccountError] = useState('')
  const [amount, setAmount] = useState(initial?.signedAmount ?? '')
  const [date, setDate] = useState(initial?.adjustmentDate ?? asOfDate)
  const [reason, setReason] = useState(initial?.reason ?? '')
  const [lines, setLines] = useState<(AdjustmentLine & { key: string })[]>(() => initial?.lines.map(l => ({ ...l, key: crypto.randomUUID() })) ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [review, setReview] = useState(false)
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal() }, [])
  useEffect(() => {
    const controller = new AbortController()
    request<AccountingAccount[]>('/adjustments/accounts', { signal: controller.signal }).then(setAccounts)
      .catch(e => { if (!controller.signal.aborted) setAccountError(e instanceof Error ? e.message : 'Không tải được tài khoản kế toán.') })
    return () => controller.abort()
  }, [])
  function change(key: string, field: 'accountId' | 'debitAmount' | 'creditAmount', value: string) {
    setLines(c => c.map(l => l.key === key ? { ...l, [field]: field === 'accountId' ? Number(value) : value } : l))
  }
  function suggest() {
    if (!amount || !new Decimal(amount).isFinite() || new Decimal(amount).isZero()) return
    const ar = accounts.find(a => a.isReceivable), other = accounts.find(a => !a.isReceivable)
    if (!ar || !other) return
    const value = new Decimal(amount).abs().toFixed(2), increase = new Decimal(amount).gt(0)
    setLines([{ key: crypto.randomUUID(), accountId: ar.accountId, debitAmount: increase ? value : '0', creditAmount: increase ? '0' : value },
      { key: crypto.randomUUID(), accountId: other.accountId, debitAmount: increase ? '0' : value, creditAmount: increase ? value : '0' }])
  }
  const debit = lines.reduce((v, l) => v.plus(l.debitAmount || 0), new Decimal(0))
  const credit = lines.reduce((v, l) => v.plus(l.creditAmount || 0), new Decimal(0))
  const delta = new Decimal(amount || 0)
  const after = new Decimal(invoice.remainingAmount).plus(delta)
  const arNet = lines.filter(l => accounts.find(a => a.accountId === l.accountId)?.isReceivable).reduce((v, l) => v.plus(l.debitAmount || 0).minus(l.creditAmount || 0), new Decimal(0))
  const valid = !delta.isZero() && delta.decimalPlaces() <= 2 && after.gte(0) && after.lte('9999999999999999.99') && reason.trim() && lines.length >= 2 && debit.eq(credit) && debit.gt(0) && debit.lte('9999999999999999.99') && arNet.eq(delta)
    && lines.every(l => accounts.some(a => a.accountId === l.accountId) && new Decimal(l.debitAmount || 0).gte(0) && new Decimal(l.creditAmount || 0).gte(0)
      && (new Decimal(l.debitAmount || 0).gt(0) !== new Decimal(l.creditAmount || 0).gt(0)) && new Decimal(l.debitAmount || 0).decimalPlaces() <= 2 && new Decimal(l.creditAmount || 0).decimalPlaces() <= 2)
  function check(e: FormEvent) { e.preventDefault(); if (valid) setReview(true) }
  async function save() {
    if (busy || !valid) return
    setBusy(true); setError('')
    try {
      const a = await request<Adjustment>(initial ? `/adjustments/${initial.adjustmentId}` : '/adjustments', { method: initial ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: invoice.invoiceId, invoiceRowVersion: invoice.invoiceRowVersion,
        adjustmentDate: date, signedAmount: amount, reason: reason.trim(), lines: lines.map(l => ({ accountId: l.accountId, debitAmount: l.debitAmount || '0', creditAmount: l.creditAmount || '0' })), ...(initial ? { rowVersion: initial.rowVersion } : {}) }) })
      onSaved(a)
    } catch (e) { setError(e instanceof ApiError ? [e.message, ...Object.values(e.errors).flat()].join(' ') : 'Chưa xác định được kết quả lưu. Hãy kiểm tra danh sách trước khi thử lại.') }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="modal invoice-modal" aria-labelledby="adjustment-editor-title" onClose={onClose} onCancel={e => { if (busy) e.preventDefault() }}>
    <div className="modal-heading"><div><span className="eyebrow">{invoice.invoiceNumber}</span><h2 id="adjustment-editor-title">{initial ? 'Sửa điều chỉnh nháp' : 'Lập điều chỉnh công nợ'}</h2></div><button className="close-button" disabled={busy} aria-label="Đóng lập điều chỉnh" onClick={() => dialog.current?.close()}>×</button></div>
    <div className="invoice-form-body"><p>{invoice.customerCode} · {invoice.customerName}</p><p className="form-intro">Bản nháp chưa thay đổi công nợ. Ghi nhận sau khi kiểm tra sẽ tạo chứng từ đối ứng.</p>
      {error && <div className="notice error" role="alert">{error}</div>}{accountError && <div className="notice error" role="alert">{accountError}</div>}
      {!review ? <form id="adjustment-editor-form" onSubmit={check}><div className="form-grid"><label htmlFor="adjustment-date">Ngày điều chỉnh *<input id="adjustment-date" required type="date" max={asOfDate} value={date} onChange={e => setDate(e.target.value)} /></label><label htmlFor="adjustment-amount">Số tiền có dấu (VND) *<input id="adjustment-amount" required type="number" min="-9999999999999999.99" max="9999999999999999.99" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /><span className="subtext">Dương: tăng phải thu · Âm: giảm phải thu</span></label><label className="full-width" htmlFor="adjustment-reason">Lý do điều chỉnh *<textarea id="adjustment-reason" aria-label="Lý do điều chỉnh" required maxLength={500} rows={3} value={reason} onChange={e => setReason(e.target.value)} /></label></div>
        <div className="invoice-lines-heading"><h3>Dòng bút toán dự kiến</h3><div className="payment-tools"><button className="secondary" type="button" disabled={!amount || delta.isZero() || !accounts.length} onClick={suggest}>Gợi ý hai dòng đối ứng</button><button className="secondary" type="button" disabled={lines.length >= 30} onClick={() => setLines(c => [...c, { key: crypto.randomUUID(), accountId: accounts[0]?.accountId ?? 0, debitAmount: '0', creditAmount: '0' }])}>Thêm dòng</button></div></div>
        {lines.length > 0 && <div className="table-scroll"><table className="adjustment-lines"><thead><tr><th>Tài khoản mô phỏng</th><th>Nợ (VND)</th><th>Có (VND)</th><th /></tr></thead><tbody>{lines.map((l, index) => <tr key={l.key}><td><select aria-label={`Tài khoản dòng ${index + 1}`} value={l.accountId} onChange={e => change(l.key, 'accountId', e.target.value)}><option value="0">Chọn tài khoản</option>{accounts.map(a => <option key={a.accountId} value={a.accountId}>{a.accountCode} — {a.accountName}</option>)}</select></td><td><input aria-label={`Nợ dòng ${index + 1}`} type="number" min="0" step="0.01" value={l.debitAmount} onChange={e => change(l.key, 'debitAmount', e.target.value)} /></td><td><input aria-label={`Có dòng ${index + 1}`} type="number" min="0" step="0.01" value={l.creditAmount} onChange={e => change(l.key, 'creditAmount', e.target.value)} /></td><td><button type="button" className="text-button" aria-label={`Xóa dòng bút toán ${index + 1}`} onClick={() => setLines(c => c.filter(x => x.key !== l.key))}>×</button></td></tr>)}</tbody></table></div>}
        <p className="money-note">Tổng Nợ: {money(debit.toFixed(2))} · Tổng Có: {money(credit.toFixed(2))}. Phần tài khoản phải thu phải khớp số điều chỉnh; mỗi dòng chỉ ghi một bên.</p>
      </form> : <div className="payment-confirm"><h3>Kiểm tra điều chỉnh nháp</h3><p>{reason}</p><p>Điều chỉnh: <strong>{money(amount)} VND</strong></p><p>Bút toán dự kiến: tổng Nợ = tổng Có = {money(debit.toFixed(2))} VND</p><p>Lưu nháp chưa tạo chứng từ chính thức và chưa thay đổi số dư.</p></div>}
      <div className="payment-amounts"><span>Còn phải thu hiện tại: <strong>{money(invoice.remainingAmount)} VND</strong></span><span>Dự kiến sau ghi nhận: <strong>{money(after.toFixed(2))} VND</strong></span></div><p className="receivable-stage-note">AR, ADJ và OTHER là tài khoản mô phỏng cho đồ án. Kiểm tra các dòng đối ứng trước khi ghi nhận.</p>
    </div><div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => review ? setReview(false) : dialog.current?.close()}>{review ? 'Quay lại chỉnh' : 'Hủy'}</button>{review ? <button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Lưu điều chỉnh nháp'}</button> : <button className="primary" form="adjustment-editor-form" type="submit" disabled={!valid}>Kiểm tra điều chỉnh</button>}</div>
  </dialog>
}
