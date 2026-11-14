import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, request } from './api'
import type { CustomerPage } from './api'
import { lineTotal, money, today, total } from './invoices'
import type { Invoice, InvoiceLine } from './invoices'

type Pick = { customerId: number; customerCode: string; customerName: string; isActive: boolean }
type Line = InvoiceLine & { key: string }
export function InvoiceEditor({ initial, onClose, onSaved }: { initial?: Invoice; onClose: () => void; onSaved: (invoice: Invoice) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState<Pick | null>(() => initial ? { ...initial, isActive: initial.customerIsActive !== false } : null)
  const [customerTerm, setCustomerTerm] = useState('')
  const [customers, setCustomers] = useState<Pick[]>([])
  const [lookupError, setLookupError] = useState('')
  const [lookupLoading, setLookupLoading] = useState(true)
  const [invoiceDate, setInvoiceDate] = useState(initial?.invoiceDate ?? today())
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? today())
  const [lines, setLines] = useState<Line[]>(() => initial?.items.map(line => ({ ...line, key: crypto.randomUUID() })) ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [validation, setValidation] = useState<string[]>([])
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal() }, [])
  useEffect(() => {
    const controller = new AbortController()
    request<CustomerPage>(`/customers?isActive=true&pageSize=20&search=${encodeURIComponent(customerTerm)}`, { signal: controller.signal })
      .then(result => { setCustomers(result.items); setLookupError('') })
      .catch(reason => { if (!controller.signal.aborted) setLookupError(reason instanceof Error ? reason.message : 'Không tải được khách hàng.') })
      .finally(() => { if (!controller.signal.aborted) setLookupLoading(false) })
    return () => controller.abort()
  }, [customerTerm])
  function change(key: string, field: 'description' | 'quantity' | 'unitPrice', value: string) {
    setLines(current => current.map(line => line.key === key ? { ...line, [field]: value } : line))
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !selected) return
    setSaving(true); setError(''); setValidation([])
    try {
      const result = await request<Invoice>(initial ? `/invoices/${initial.invoiceId}` : '/invoices', {
        method: initial ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: selected.customerId, invoiceDate, dueDate,
          items: lines.map(line => ({ description: line.description.trim(), quantity: line.quantity, unitPrice: line.unitPrice })),
          ...(initial ? { rowVersion: initial.rowVersion } : {}) }),
      })
      onSaved(result)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Không kết nối được máy chủ. Nội dung đã nhập vẫn được giữ lại.')
      if (reason instanceof ApiError) setValidation(Object.values(reason.errors).flat())
    } finally { setSaving(false) }
  }
  return <dialog ref={dialog} className="modal invoice-modal" aria-labelledby="invoice-editor-title" onClose={onClose} onCancel={event => { if (saving) event.preventDefault() }}>
    <div className="modal-heading"><div><span className="eyebrow">{initial ? `BẢN NHÁP #${initial.invoiceId}` : 'HÓA ĐƠN MỚI'}</span><h2 id="invoice-editor-title">{initial ? 'Chỉnh sửa hóa đơn nháp' : 'Lập hóa đơn nháp'}</h2></div><button className="close-button" disabled={saving} aria-label="Đóng hóa đơn" onClick={() => dialog.current?.close()}>×</button></div>
    <form className="invoice-edit-form" onSubmit={save}><fieldset className="invoice-fieldset" disabled={saving}><div className="invoice-form-body">
      <p className="form-intro">Bản nháp chưa phát sinh công nợ. Hệ thống tính lại tổng tiền khi lưu.</p>
      {error && <div className="notice error" role="alert"><div>{error}{validation.length > 0 && <ul>{validation.map((message, index) => <li key={index}>{message}</li>)}</ul>}</div></div>}
      <div className="form-grid"><label className="full-width" htmlFor="customer-lookup">Tìm khách hàng đang hoạt động<input id="customer-lookup" placeholder="Nhập mã hoặc tên để tìm (hiển thị tối đa 20 kết quả)" value={customerTerm} maxLength={200} onChange={e => { setLookupLoading(true); setCustomerTerm(e.target.value) }} /></label>
      <label className="full-width" htmlFor="invoice-customer">Khách hàng <span className="required">*</span><select id="invoice-customer" required value={selected?.customerId ?? ''} onChange={e => setSelected(customers.find(customer => customer.customerId === Number(e.target.value)) ?? null)}><option value="">{lookupLoading ? 'Đang tải khách hàng…' : 'Chọn khách hàng'}</option>{selected && !customers.some(customer => customer.customerId === selected.customerId) && <option value={selected.customerId}>{selected.customerCode} — {selected.customerName}{!selected.isActive ? ' (Ngừng hoạt động)' : ''}</option>}{customers.map(customer => <option key={customer.customerId} value={customer.customerId}>{customer.customerCode} — {customer.customerName}</option>)}</select>{lookupError && <span className="field-error" role="alert">{lookupError}</span>}{!lookupLoading && !lookupError && customers.length === 0 && <span className="subtext">Không có khách hàng phù hợp. Hãy thử từ khóa khác hoặc tạo khách hàng trước.</span>}</label>
      <label htmlFor="invoice-date">Ngày lập <span className="required">*</span><input id="invoice-date" type="date" required value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></label><label htmlFor="due-date">Hạn thanh toán <span className="required">*</span><input id="due-date" type="date" required min={invoiceDate} value={dueDate} onChange={e => setDueDate(e.target.value)} /></label></div>
      <div className="invoice-lines-heading"><h3>Chi tiết hàng hóa / dịch vụ</h3><button className="secondary" type="button" disabled={lines.length >= 200} onClick={() => setLines(current => [...current, { key: crypto.randomUUID(), description: '', quantity: '1', unitPrice: '0' }])}>＋ Thêm dòng</button></div>
      {lines.length === 0 ? <p className="draft-empty">Chưa có dòng chi tiết. Bạn có thể lưu bản nháp trống và bổ sung sau.</p> : <div className="table-scroll"><table className="invoice-lines"><thead><tr><th>Nội dung</th><th>Số lượng</th><th>Đơn giá (VND)</th><th>Thành tiền</th><th><span className="sr-only">Xóa dòng</span></th></tr></thead><tbody>{lines.map((line, index) => <tr key={line.key}><td><input aria-label={`Nội dung dòng ${index + 1}`} required maxLength={500} value={line.description} onChange={e => change(line.key, 'description', e.target.value)} placeholder="Hàng hóa hoặc dịch vụ" /></td><td><input aria-label={`Số lượng dòng ${index + 1}`} type="number" required min="0.001" max="999999999.999" step="0.001" value={line.quantity} onChange={e => change(line.key, 'quantity', e.target.value)} /></td><td><input aria-label={`Đơn giá dòng ${index + 1}`} type="number" required min="0" max="999999999999.99" step="0.01" value={line.unitPrice} onChange={e => change(line.key, 'unitPrice', e.target.value)} /></td><td className="amount">{money(lineTotal(line))}</td><td><button className="text-button remove-line" type="button" aria-label={`Xóa dòng ${index + 1}`} onClick={() => setLines(current => current.filter(item => item.key !== line.key))}>×</button></td></tr>)}</tbody></table></div>}
      <div className="invoice-total"><span>Tổng tạm tính (VND)</span><strong>{money(total(lines))}</strong></div><p className="money-note">Làm tròn từng dòng đến 2 chữ số thập phân; số lượng tối đa 3 chữ số, đơn giá tối đa 2 chữ số thập phân.</p>
    </div><div className="modal-actions"><button className="secondary" type="button" onClick={() => dialog.current?.close()}>Quay lại</button><button className="primary" type="submit" disabled={!selected || !selected.isActive}>{saving ? 'Đang lưu…' : 'Lưu nháp'}</button></div></fieldset></form>
  </dialog>
}
