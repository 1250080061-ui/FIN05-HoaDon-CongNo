import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, request } from './api'
import type { CustomerPage, Customer } from './api'
import { today } from './invoices'
import type { Payment } from './payments'

export function PaymentEditor({ initial, onClose, onSaved }: { initial?: Payment; onClose: () => void; onSaved: (p: Payment) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [customerId, setCustomerId] = useState(String(initial?.customerId ?? ''))
  const [term, setTerm] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [lookupError, setLookupError] = useState('')
  const [date, setDate] = useState(initial?.paymentDate ?? today())
  const [amount, setAmount] = useState(initial?.amount ?? '')
  const [method, setMethod] = useState(initial?.paymentMethod ?? 'Cash')
  const [reference, setReference] = useState(initial?.referenceNumber ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal() }, [])
  useEffect(() => {
    const controller = new AbortController()
    request<CustomerPage>(`/customers?isActive=true&pageSize=20&search=${encodeURIComponent(term)}`, { signal: controller.signal })
      .then(data => { setCustomers(data.items); setLookupError('') })
      .catch(reason => { if (!controller.signal.aborted) setLookupError(reason instanceof Error ? reason.message : 'Không tải được khách hàng.') })
    return () => controller.abort()
  }, [term])
  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true); setError('')
    try {
      const p = await request<Payment>(initial ? `/payments/${initial.paymentId}` : '/payments', {
        method: initial ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: Number(customerId), paymentDate: date, amount, paymentMethod: method,
          referenceNumber: reference.trim() || null, ...(initial ? { rowVersion: initial.rowVersion } : {}) }),
      })
      onSaved(p)
    } catch (reason) {
      setError(reason instanceof ApiError ? [reason.message, ...Object.values(reason.errors).flat()].join(' ') : 'Không kết nối được máy chủ. Dữ liệu đã nhập được giữ lại.')
    } finally { setSaving(false) }
  }
  return <dialog ref={dialog} className="modal invoice-modal" aria-labelledby="payment-editor-title" onClose={onClose} onCancel={e => { if (saving) e.preventDefault() }}>
    <div className="modal-heading"><div><span className="eyebrow">PHIẾU THU</span><h2 id="payment-editor-title">{initial ? 'Sửa phiếu thu nháp' : 'Lập phiếu thu'}</h2></div><button className="close-button" disabled={saving} aria-label="Đóng lập phiếu thu" onClick={() => dialog.current?.close()}>×</button></div>
    <form onSubmit={save}><fieldset className="invoice-fieldset" disabled={saving}><div className="invoice-form-body">
      <p className="form-intro">Lưu nháp để kiểm tra. Chỉ phiếu thu đã xác nhận mới được kế toán phân bổ; lưu phiếu chưa làm giảm công nợ.</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="form-grid"><label className="full-width" htmlFor="payment-lookup">Tìm khách hàng<input id="payment-lookup" maxLength={200} value={term} onChange={e => setTerm(e.target.value)} placeholder="Nhập mã hoặc tên khách hàng (tối đa 20 kết quả)" /></label>
        <label className="full-width" htmlFor="payment-customer">Khách hàng *<select id="payment-customer" required value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">Chọn khách hàng đang hoạt động</option>{initial && !customers.some(c => c.customerId === initial.customerId) && <option value={initial.customerId}>{initial.customerCode} — {initial.customerName}</option>}{customers.map(c => <option key={c.customerId} value={c.customerId}>{c.customerCode} — {c.customerName}</option>)}</select>{lookupError && <span className="field-error" role="alert">{lookupError}</span>}</label>
        <label htmlFor="payment-date">Ngày thu *<input id="payment-date" type="date" required max={today()} value={date} onChange={e => setDate(e.target.value)} /></label>
        <label htmlFor="payment-amount">Số tiền (VND) *<input id="payment-amount" type="number" required min="0.01" max="9999999999999999.99" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label htmlFor="payment-method">Phương thức *<select id="payment-method" value={method} onChange={e => setMethod(e.target.value as Payment['paymentMethod'])}><option value="Cash">Tiền mặt</option><option value="BankTransfer">Chuyển khoản</option></select></label>
        <label htmlFor="payment-reference">Mã tham chiếu {method === 'BankTransfer' ? '*' : '(nếu có)'}<input id="payment-reference" required={method === 'BankTransfer'} maxLength={100} value={reference} onChange={e => setReference(e.target.value)} /></label></div>
    </div><div className="modal-actions"><button type="button" className="secondary" onClick={() => dialog.current?.close()}>Quay lại</button><button className="primary" disabled={!customerId} type="submit">{saving ? 'Đang lưu…' : 'Lưu phiếu thu nháp'}</button></div></fieldset></form>
  </dialog>
}
