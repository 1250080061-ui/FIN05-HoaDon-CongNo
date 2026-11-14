import { useEffect, useState } from 'react'
import Decimal from 'decimal.js'
import { request } from './api'
import { canReadReports, canReadPayments, canWriteInvoices, canWritePayments, canWriteCustomers } from './auth'
import { Workspace } from './Workspace'
import { Icon } from './Icons'
import { money } from './invoices'
import { InvoiceDetails } from './InvoiceDetails'
import { BalanceBridge } from './BalanceBridge'
import type { Report } from './reports'
import type { Payment } from './payments'

type Debt = { invoiceId: number; invoiceNumber: string; customerName: string; customerCode: string; dueDate: string; overdueDays: number; remainingAmount: string }
type Snapshot = { receivables?: Report; collections?: Report; overdue?: { items: Debt[]; total: number }; drafts?: number; customers?: number; activeCustomers?: number; payments?: { items: Payment[]; total: number }; pendingPayments?: number }
const date = (value: string) => value.split('-').reverse().join('/')

export function OverviewPage() {
  const [data, setData] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [detailId, setDetailId] = useState<number | null>(null)
  const finance = canReadReports()
  const cashier = !finance && canReadPayments()
  useEffect(() => {
    const controller = new AbortController()
    const get = <T,>(path: string) => request<T>(path, { signal: controller.signal })
    const load = async (): Promise<Snapshot> => {
      if (finance) {
        const [receivables, collections, overdue, drafts] = await Promise.all([
          get<Report>('/reports?type=Receivables&pageSize=1'),
          get<Report>('/reports?type=Collections&pageSize=1'),
          get<{ items: Debt[]; total: number }>('/receivables?overdue=true&pageSize=6'),
          get<{ total: number }>('/invoices?status=Draft&pageSize=1'),
        ])
        return { receivables, collections, overdue, drafts: drafts.total }
      }
      if (cashier) {
        const [payments, pending] = await Promise.all([get<{ items: Payment[]; total: number }>('/payments?pageSize=6'), get<{ total: number }>('/payments?status=Draft&pageSize=1')])
        return { payments, pendingPayments: pending.total }
      }
      const [customers, active] = await Promise.all([get<{ total: number }>('/customers?pageSize=1'), get<{ total: number }>('/customers?isActive=true&pageSize=1')])
      return { customers: customers.total, activeCustomers: active.total }
    }
    load().then(result => { setData(result); setError('') }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Không tải được số liệu.') })
    return () => controller.abort()
  }, [finance, cashier, revision])
  function reload() { setData(null); setError(''); setRevision(value => value + 1) }
  const stats = finance ? [
    { label: 'Còn phải thu', value: data?.receivables ? money(data.receivables.summary.remainingAmount) : '—', unit: 'VND', note: 'Số dư hiện tại sau phân bổ', className: 'main-stat' },
    { label: 'Công nợ quá hạn', value: data?.receivables ? money(data.receivables.summary.overdueAmount) : '—', unit: 'VND', note: data?.overdue ? `${data.overdue.total} hóa đơn cần theo dõi` : 'Chỉ khoản còn phải thu', className: 'risk-stat' },
    { label: 'Tiền chưa phân bổ', value: data?.collections ? money(data.collections.summary.unallocatedAmount) : '—', unit: 'VND', note: 'Từ các phiếu thu đã xác nhận', className: '' },
    { label: 'Hóa đơn nháp', value: data?.drafts ?? '—', unit: 'CHỨNG TỪ', note: 'Chưa làm phát sinh công nợ', className: '' },
  ] : cashier ? [
    { label: 'Phiếu thu đã lập', value: data?.payments?.total ?? '—', unit: 'PHIẾU', note: 'Toàn bộ trạng thái', className: 'main-stat' },
    { label: 'Chờ xác nhận', value: data?.pendingPayments ?? '—', unit: 'PHIẾU', note: 'Phiếu còn ở trạng thái nháp', className: '' },
  ] : [
    { label: 'Hồ sơ khách hàng', value: data?.customers ?? '—', unit: 'HỒ SƠ', note: 'Danh mục khách hàng hiện tại', className: 'main-stat' },
    { label: 'Đang hoạt động', value: data?.activeCustomers ?? '—', unit: 'KHÁCH HÀNG', note: 'Có thể sử dụng cho giao dịch mới', className: '' },
  ]
  const actions = [
    { href: '/', label: 'Hồ sơ khách hàng', detail: 'Tra cứu và cập nhật thông tin giao dịch', icon: 'customers' as const, allowed: canWriteCustomers() },
    { href: '/invoices', label: 'Lập & phát hành hóa đơn', detail: 'Kiểm tra chứng từ trước khi ghi nhận phải thu', icon: 'invoices' as const, allowed: canWriteInvoices() },
    { href: '/payments', label: 'Ghi nhận khoản thu', detail: 'Lập phiếu, xác nhận và theo dõi phân bổ', icon: 'payments' as const, allowed: canWritePayments() },
    { href: '/reports', label: 'Đối chiếu báo cáo', detail: 'Công nợ, quá hạn và các khoản tiền thu', icon: 'reports' as const, allowed: finance },
  ].filter(action => action.allowed)
  return <Workspace section="overview">
    <div className="breadcrumb">FIN–05 <span>/</span><strong>Bàn làm việc</strong></div>
    <div className="page-heading"><div><div className="eyebrow">SỔ THEO DÕI / TỔNG HỢP NGHIỆP VỤ</div><h1>Bàn làm việc</h1><p>{finance ? 'Nhìn số dư, theo thời hạn, đối chiếu từng chứng từ.' : cashier ? 'Theo dõi phiếu thu và các khoản cần xác nhận.' : 'Quản lý hồ sơ trước khi bắt đầu một giao dịch.'}</p></div><button className="secondary" onClick={reload} disabled={!data && !error}>↻ Cập nhật số liệu</button></div>
    {error ? <div className="notice error" role="alert">{error}<button className="text-button" onClick={reload}>Thử lại</button></div> : <>
      <div className="overview-strip"><span><i />{data ? 'Số liệu từ chứng từ đã lưu' : 'Đang tổng hợp số liệu…'}</span><span>{data?.receivables ? `Ngày nghiệp vụ ${date(data.receivables.asOfDate)}` : 'Theo quyền truy cập của bạn'} · VND</span></div>
      <section className={`ledger-stats ${finance ? '' : 'compact-stats'}`} aria-label="Tổng hợp nghiệp vụ">{stats.map((stat, i) => <div key={stat.label} className={stat.className}><div className="stat-top"><span>{stat.label}</span><small>0{i + 1}</small></div><strong>{stat.value}</strong><div className="stat-bottom"><small>{stat.note}</small><span>{stat.unit}</span></div></div>)}</section>
      {finance && data?.receivables && <BalanceBridge summary={data.receivables.summary} />}
      {finance && <div className="overview-columns"><section className="customer-panel overdue-ledger"><div className="panel-heading"><div><div className="eyebrow">ƯU TIÊN THEO DÕI</div><h2>Hóa đơn đã quá hạn <span className="count">{data?.overdue?.total ?? '—'}</span></h2></div><a className="text-button" href="/receivables?overdue=true">Xem toàn bộ ↗</a></div>{!data ? <div className="empty-state" role="status"><div className="spinner" /><p>Đang đối chiếu hạn thanh toán…</p></div> : data.overdue?.items.length ? <div className="table-scroll"><table><thead><tr><th>Chứng từ / Khách hàng</th><th>Quá hạn</th><th>Còn phải thu</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{data.overdue.items.map(item => <tr key={item.invoiceId}><td><span className="customer-code">{item.invoiceNumber}</span><span className="subtext">{item.customerName}</span></td><td><span className="overdue-days">{item.overdueDays} ngày</span><span className="subtext">Hạn {date(item.dueDate)}</span></td><td className="amount">{money(item.remainingAmount)}</td><td><button className="row-open" aria-label={`Xem hóa đơn ${item.invoiceNumber}`} onClick={() => setDetailId(item.invoiceId)}><Icon name="arrow" size={18} /></button></td></tr>)}</tbody></table></div> : <div className="empty-state"><Icon name="receivables" size={34} /><h3>Không có hóa đơn quá hạn</h3><p>Các khoản đã tất toán không nằm trong danh sách cần theo dõi này.</p></div>}<div className="ledger-table-foot">Tối đa 6 hóa đơn · Ưu tiên hạn thanh toán sớm nhất</div></section>
        <section className="aging-ledger"><div className="eyebrow">PHÂN TÍCH TUỔI NỢ</div><h2>Số dư theo thời hạn</h2><p>Chỉ các khoản còn phải thu</p><div className="overview-aging">{data?.receivables?.aging.map((bucket, i) => {
          const total = new Decimal(data.receivables!.summary.remainingAmount)
          const percent = total.greaterThan(0) ? Decimal.min(100, new Decimal(bucket.amount).div(total).times(100)).toNumber() : 0
          return <div key={bucket.bucket} className={`age-bucket age-${i}`}><div><span>{bucket.label}</span><strong>{money(bucket.amount)}</strong></div><div className="age-track"><i style={{ width: `${percent}%` }} /></div><small>{bucket.count} hóa đơn</small></div>
        }) ?? <p>Đang phân nhóm thời hạn…</p>}</div><a className="text-button" href="/reports">Mở báo cáo đối chiếu ↗</a></section></div>}
      {cashier && <section className="customer-panel"><div className="panel-heading"><h2>Sổ phiếu thu</h2><a className="text-button" href="/payments">Xem danh sách ↗</a></div>{data?.payments?.items.length ? <div className="table-scroll"><table><thead><tr><th>Số phiếu</th><th>Khách hàng</th><th>Số tiền (VND)</th><th>Trạng thái</th></tr></thead><tbody>{data.payments.items.map(payment => <tr key={payment.paymentId}><td className="customer-code">{payment.paymentNumber}</td><td>{payment.customerName}</td><td className="amount">{money(payment.amount)}</td><td><span className={`badge ${payment.status === 'Confirmed' ? 'active' : 'draft'}`}>{payment.status === 'Confirmed' ? 'Đã xác nhận' : 'Nháp'}</span></td></tr>)}</tbody></table></div> : <div className="empty-state"><Icon name="payments" size={32} /><p>{data ? 'Chưa có phiếu thu. Bắt đầu tại mục Phiếu thu.' : 'Đang tải phiếu thu…'}</p></div>}</section>}
    </>}
    <section className="desk-actions"><div><div className="eyebrow">THAO TÁC NGHIỆP VỤ</div><h2>Tiếp tục công việc</h2></div><div className="desk-action-grid">{actions.map(action => <a href={action.href} key={action.href}><Icon name={action.icon} size={24} /><div><strong>{action.label}</strong><span>{action.detail}</span></div><Icon name="arrow" size={18} /></a>)}</div></section>
    <div className="process-strip"><span>Quy trình đối chiếu</span><span>01 Khách hàng</span><i>→</i><span>02 Hóa đơn</span><i>→</i><span>03 Thu & phân bổ</span><i>→</i><span>04 Công nợ</span></div>
    <footer className="page-footer"><span>FIN–05 / Sổ nghiệp vụ công nợ</span><span>Số dư hiện tại · Phát hành hóa đơn mô phỏng</span></footer>
    {detailId !== null && <InvoiceDetails id={detailId} onClose={() => setDetailId(null)} onEdit={() => window.location.assign('/invoices')} onChanged={reload} />}
  </Workspace>
}
