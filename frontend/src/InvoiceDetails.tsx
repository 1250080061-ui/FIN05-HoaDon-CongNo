import { useEffect, useRef, useState } from 'react'
import { ApiError, request } from './api'
import { money, statuses } from './invoices'
import type { Invoice } from './invoices'
import { canWriteInvoices } from './auth'

export function InvoiceDetails({ id, onClose, onEdit, onChanged }: { id: number; onClose: () => void; onEdit: (invoice: Invoice) => void; onChanged: (action: 'cancel' | 'issue') => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [confirm, setConfirm] = useState<'cancel' | 'issue' | null>(null)
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal() }, [])
  useEffect(() => {
    const controller = new AbortController()
    request<Invoice>(`/invoices/${id}`, { signal: controller.signal }).then(setInvoice)
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Không tải được hóa đơn.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id, revision])
  async function perform(action: 'cancel' | 'issue') {
    if (!invoice || processing) return
    setProcessing(true); setError('')
    try {
      setInvoice(await request<Invoice>(`/invoices/${invoice.invoiceId}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowVersion: invoice.rowVersion }) }))
      setConfirm(null); onChanged(action)
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Không hoàn tất được thao tác. Vui lòng thử lại.') }
    finally { setProcessing(false) }
  }
  return <dialog ref={dialog} className="modal invoice-modal" aria-labelledby="invoice-detail-title" onClose={onClose} onCancel={event => { if (processing) event.preventDefault() }}>
    <div className="modal-heading"><div><span className="eyebrow">HỒ SƠ HÓA ĐƠN</span><h2 id="invoice-detail-title">{invoice?.invoiceNumber ?? `Hóa đơn #${id}`}</h2></div><button className="close-button" disabled={processing} aria-label="Đóng chi tiết hóa đơn" onClick={() => dialog.current?.close()}>×</button></div>
    <div className="invoice-details-body">{loading ? <p role="status">Đang tải hóa đơn…</p> : error && !invoice ? <div className="notice error" role="alert">{error}<button className="secondary" onClick={() => { setLoading(true); setError(''); setRevision(value => value + 1) }}>Thử lại</button></div> : invoice && <>
      <div className="invoice-summary"><div><span className={`badge ${invoice.issueStatus === 'Draft' ? 'draft' : invoice.issueStatus === 'Issued' ? 'active' : 'inactive'}`}>{statuses[invoice.issueStatus]}</span><h3>{invoice.customerName}</h3><p>{invoice.customerCode}</p></div><dl><div><dt>Ngày lập</dt><dd>{invoice.invoiceDate.split('-').reverse().join('/')}</dd></div><div><dt>Hạn thanh toán</dt><dd>{invoice.dueDate.split('-').reverse().join('/')}</dd></div><div><dt>Người lập</dt><dd>{invoice.creatorName}</dd></div>{invoice.issuedAt && <div><dt>Phát hành lúc</dt><dd>{new Date(invoice.issuedAt).toLocaleString('vi-VN')}</dd></div>}</dl></div>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="table-scroll"><table className="invoice-read-lines"><thead><tr><th>Nội dung</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{invoice.items.map(item => <tr key={item.invoiceItemId}><td>{item.description}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td>{money(item.lineAmount!)}</td></tr>)}</tbody></table></div>{invoice.items.length === 0 && <p className="draft-empty">Bản nháp chưa có dòng chi tiết.</p>}
      <div className="invoice-total"><span>Tổng cộng (VND)</span><strong>{money(invoice.totalAmount)}</strong></div><p className="money-note">{invoice.issueStatus === 'Draft' ? 'Bản nháp chưa phát sinh công nợ. Khi phát hành mô phỏng, hóa đơn sẽ được cấp số và khóa chỉnh sửa.' : invoice.issueStatus === 'Issued' ? 'Đã phát hành mô phỏng và hình thành khoản phải thu. Đây không phải hóa đơn điện tử gửi cơ quan thuế.' : 'Bản nháp đã hủy được giữ lại để truy vết và không thể sửa tiếp.'}</p>
      {invoice.issueStatus === 'Draft' && (invoice.items.length === 0 || invoice.totalAmount === '0.00' || invoice.customerIsActive === false) && <p className="issue-requirements">Để phát hành cần khách hàng đang hoạt động, ít nhất một dòng chi tiết và tổng tiền lớn hơn 0.</p>}
      {confirm && <div className="cancel-confirm" role="group" aria-label={confirm === 'cancel' ? 'Xác nhận hủy bản nháp' : 'Xác nhận phát hành mô phỏng'}><p>{confirm === 'cancel' ? 'Hủy bản nháp này? Nội dung và nhật ký được giữ lại, bản nháp sẽ không thể chỉnh sửa tiếp.' : `Phát hành mô phỏng hóa đơn ${money(invoice.totalAmount)} VND? Hệ thống sẽ cấp số, ghi nhận khoản phải thu và khóa sửa/hủy nháp.`}</p><div><button className="secondary" disabled={processing} onClick={() => setConfirm(null)}>{confirm === 'cancel' ? 'Giữ bản nháp' : 'Quay lại'}</button><button className={confirm === 'cancel' ? 'danger' : 'primary'} disabled={processing} onClick={() => perform(confirm)}>{processing ? 'Đang xử lý…' : confirm === 'cancel' ? 'Xác nhận hủy nháp' : 'Xác nhận phát hành'}</button></div></div>}
    </>}</div><div className="modal-actions">{invoice && invoice.issueStatus === 'Draft' && canWriteInvoices() && <><button className="text-button status-action" disabled={processing} onClick={() => setConfirm('cancel')}>Hủy bản nháp</button><button className="secondary" disabled={processing} onClick={() => onEdit(invoice)}>Chỉnh sửa nháp</button><button className="primary" disabled={processing || invoice.items.length === 0 || invoice.totalAmount === '0.00' || invoice.customerIsActive === false} onClick={() => setConfirm('issue')}>Phát hành mô phỏng</button></>}<button className="secondary" disabled={processing} onClick={() => dialog.current?.close()}>Đóng</button></div>
  </dialog>
}
