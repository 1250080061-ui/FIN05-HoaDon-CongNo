import { useEffect, useRef, useState } from 'react'
import Decimal from 'decimal.js'
import { ApiError, request } from './api'
import { canAllocatePayments, canWritePayments } from './auth'
import { money } from './invoices'
import type { Payment } from './payments'
import { paymentMethod, paymentStatus } from './payments'

type Candidate = { invoiceId: number; invoiceNumber: string; dueDate: string; remainingAmount: string; rowVersion: string }
type Choice = Candidate & { amount: string }
function message(reason: unknown) {
  return reason instanceof ApiError ? [reason.message, ...Object.values(reason.errors).flat()].join(' ') : 'Không kết nối được máy chủ. Hãy tải lại chi tiết trước khi thử lại.'
}
export function PaymentDetails({ id, onClose, onEdit, onChanged }: { id: number; onClose: () => void; onEdit: (p: Payment) => void; onChanged: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [allocating, setAllocating] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal() }, [])
  useEffect(() => {
    const controller = new AbortController()
    request<Payment>(`/payments/${id}`, { signal: controller.signal }).then(setPayment)
      .catch(reason => { if (!controller.signal.aborted) setError(message(reason)) })
    return () => controller.abort()
  }, [id])
  async function confirmPayment() {
    if (!payment || busy) return
    setBusy(true); setError('')
    try {
      const p = await request<Payment>(`/payments/${id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowVersion: payment.rowVersion }) })
      setPayment(p); setConfirm(false); setNotice('Đã xác nhận phiếu thu. Kế toán có thể phân bổ tiền vào hóa đơn.'); onChanged()
    } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="modal invoice-modal payment-detail" aria-labelledby="payment-detail-title" onClose={onClose} onCancel={e => { if (busy) e.preventDefault() }}>
    <div className="modal-heading"><div><span className="eyebrow">CHI TIẾT PHIẾU THU</span><h2 id="payment-detail-title">{payment?.paymentNumber ?? 'Đang tải phiếu thu…'}</h2></div><button className="close-button" disabled={busy} aria-label="Đóng chi tiết phiếu thu" onClick={() => dialog.current?.close()}>×</button></div>
    <div className="invoice-form-body">{error && <div role="alert" className="notice error">{error}</div>}{notice && <div role="status" className="notice success">{notice}</div>}
      {payment && <><div className="payment-summary"><div><span className={`badge ${payment.status === 'Confirmed' ? 'active' : ''}`}>{paymentStatus(payment.status)}</span><h3>{payment.customerName}</h3><span className="subtext">{payment.customerCode} · Người lập: {payment.receiverName}</span><p>Ngày thu: {payment.paymentDate.split('-').reverse().join('/')} · {paymentMethod(payment.paymentMethod)}</p><p>Tham chiếu: {payment.referenceNumber ?? '—'}</p>{payment.confirmedAt && <p>Đã xác nhận: {new Date(payment.confirmedAt).toLocaleString('vi-VN')}</p>}</div><div className="payment-amounts"><span>Giá trị phiếu: <strong>{money(payment.amount)} VND</strong></span><span>Đã phân bổ: <strong>{money(payment.allocatedAmount)} VND</strong></span><span>Còn chưa phân bổ: <strong>{money(payment.unallocatedAmount)} VND</strong></span></div></div>
      {payment.status === 'Draft' && !allocating && canWritePayments() && <div className="payment-tools"><button className="secondary" disabled={busy} onClick={() => onEdit(payment)}>Sửa nháp</button><button className="primary" disabled={busy} onClick={() => setConfirm(true)}>Xác nhận phiếu thu</button></div>}
      {confirm && <div className="payment-confirm" role="group" aria-label="Kiểm tra xác nhận phiếu thu"><h3>Xác nhận đã nhận {money(payment.amount)} VND?</h3><p>Chỉ xác nhận khi đã đối chiếu khoản thu. Sau khi xác nhận, phiếu bị khóa chỉnh sửa. Công nợ giảm khi kế toán thực hiện phân bổ.</p><button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>Quay lại</button><button className="primary" disabled={busy} onClick={() => void confirmPayment()}>{busy ? 'Đang xác nhận…' : 'Đồng ý xác nhận'}</button></div>}
      {payment.status === 'Confirmed' && canAllocatePayments() && new Decimal(payment.unallocatedAmount).gt(0) && !allocating && <div className="payment-tools"><button className="primary" onClick={() => { setAllocating(true); setNotice(''); setError('') }}>Phân bổ vào hóa đơn</button></div>}
      {allocating && <AllocationEditor payment={payment} onBusy={setBusy} onClose={() => setAllocating(false)} onSaved={p => { setPayment(p); setAllocating(false); setNotice('Đã phân bổ thanh toán và cập nhật công nợ.'); onChanged() }} />}
      <h3>Lịch sử phân bổ</h3>{payment.allocations.length ? <div className="table-scroll"><table><thead><tr><th>Hóa đơn</th><th>Số tiền (VND)</th><th>Thời điểm</th><th>Người phân bổ</th></tr></thead><tbody>{payment.allocations.map(a => <tr key={a.allocationId}><td>{a.invoiceNumber}</td><td className="amount">{money(a.allocatedAmount)}</td><td>{new Date(a.allocationDate).toLocaleString('vi-VN')}</td><td>{a.actorName}</td></tr>)}</tbody></table></div> : <p className="draft-empty">Chưa có khoản phân bổ. Phiếu thu chưa phân bổ không làm giảm công nợ hóa đơn.</p>}</>}
    </div><div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => dialog.current?.close()}>Đóng</button></div>
  </dialog>
}

function AllocationEditor({ payment, onBusy, onClose, onSaved }: { payment: Payment; onBusy: (busy: boolean) => void; onClose: () => void; onSaved: (p: Payment) => void }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: Candidate[]; total: number } | null>(null)
  const [choices, setChoices] = useState<Record<number, Choice>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [loadedPage, setLoadedPage] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    request<{ items: Candidate[]; total: number }>(`/payments/${payment.paymentId}/available-invoices?page=${page}&pageSize=10`, { signal: controller.signal })
      .then(result => { setData(result); setError(''); setLoadedPage(page) })
      .catch(reason => { if (!controller.signal.aborted) { setError(message(reason)); setData(null) } })
    return () => controller.abort()
  }, [page, payment.paymentId])
  const lines = Object.values(choices).filter(x => x.amount !== '' && new Decimal(x.amount).gt(0))
  const sum = lines.reduce((value, x) => value.plus(x.amount), new Decimal(0))
  const invalid = !lines.length || sum.gt(payment.unallocatedAmount) || lines.some(x => new Decimal(x.amount).gt(x.remainingAmount) || new Decimal(x.amount).decimalPlaces() > 2) || Object.values(choices).some(x => x.amount !== '' && new Decimal(x.amount).lt(0))
  async function allocate() {
    if (busy || invalid) return
    setBusy(true); onBusy(true); setError('')
    try {
      const p = await request<Payment>(`/payments/${payment.paymentId}/allocations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowVersion: payment.rowVersion,
        items: lines.map(x => ({ invoiceId: x.invoiceId, rowVersion: x.rowVersion, amount: x.amount })) }) })
      onSaved(p)
    } catch (reason) { setError(message(reason)); setConfirm(false) } finally { setBusy(false); onBusy(false) }
  }
  return <section className="allocation-editor" aria-label="Phân bổ thanh toán"><h3>Phân bổ vào hóa đơn cùng khách hàng</h3><p>Chọn số tiền cho từng hóa đơn. Có thể phân bổ một phần và giữ lại số tiền chưa phân bổ.</p>{error && <div role="alert" className="notice error">{error}</div>}
    {!confirm ? <>{data && loadedPage === page ? data.items.length ? <div className="table-scroll"><table><thead><tr><th>Hóa đơn</th><th>Hạn thanh toán</th><th>Còn phải thu</th><th>Phân bổ (VND)</th></tr></thead><tbody>{data.items.map(item => <tr key={item.invoiceId}><td>{item.invoiceNumber}</td><td>{item.dueDate.split('-').reverse().join('/')}</td><td className="amount">{money(item.remainingAmount)}</td><td><input type="number" aria-label={`Phân bổ ${item.invoiceNumber}`} min="0" max={item.remainingAmount} step="0.01" value={choices[item.invoiceId]?.amount ?? ''} onChange={e => { const amount = e.target.value; if (!amount || /^\d+(\.\d*)?$/.test(amount)) setChoices(c => ({ ...c, [item.invoiceId]: { ...item, amount } })) }} placeholder="0.00" /></td></tr>)}</tbody></table></div> : <p>Không còn hóa đơn đủ điều kiện phân bổ.</p> : !error && <p role="status">Đang tải hóa đơn…</p>}
      <div className="pagination"><span>{data?.total ?? 0} hóa đơn còn công nợ</span><div><button className="page-button" disabled={page <= 1 || loadedPage !== page} aria-label="Hóa đơn phân bổ trang trước" onClick={() => setPage(p => p - 1)}>‹</button><span>Trang {page}</span><button className="page-button" disabled={!data || page * 10 >= data.total || loadedPage !== page} aria-label="Hóa đơn phân bổ trang sau" onClick={() => setPage(p => p + 1)}>›</button></div></div>
      <div className="invoice-total"><span>Tổng chọn / Tiền chưa phân bổ</span><strong>{money(sum.toFixed(2))} / {money(payment.unallocatedAmount)} VND</strong></div>{invalid && lines.length > 0 && <p className="field-error">Số tiền phải hợp lệ, không vượt tiền phiếu thu hoặc công nợ từng hóa đơn.</p>}
      <div className="payment-tools"><button className="secondary" onClick={onClose}>Hủy phân bổ</button><button className="primary" disabled={invalid || !!error} onClick={() => setConfirm(true)}>Kiểm tra phân bổ</button></div></> : <div className="payment-confirm"><h3>Xác nhận phân bổ {money(sum.toFixed(2))} VND</h3><ul>{lines.map(x => <li key={x.invoiceId}>{x.invoiceNumber}: {money(x.amount)} VND</li>)}</ul><p>Công nợ các hóa đơn sẽ giảm tương ứng. Thao tác được lưu cùng nhật ký.</p><button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>Quay lại chỉnh</button><button className="primary" disabled={busy} onClick={() => void allocate()}>{busy ? 'Đang phân bổ…' : 'Xác nhận phân bổ'}</button></div>}
  </section>
}
