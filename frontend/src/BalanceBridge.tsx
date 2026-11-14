import Decimal from 'decimal.js'
import { money } from './invoices'
import type { Report } from './reports'

export function BalanceBridge({ summary }: { summary: Report['summary'] }) {
  const adjusted = new Decimal(summary.originalAmount).plus(summary.adjustmentAmount)
  const paid = new Decimal(summary.allocatedAmount)
  const percent = adjusted.greaterThan(0) ? Decimal.max(0, Decimal.min(100, paid.div(adjusted).times(100))) : new Decimal(0)
  const label = percent.toFixed(1).replace('.', ',')
  const steps = [
    { name: 'Giá trị hóa đơn', value: summary.originalAmount, note: 'Chỉ chứng từ đã phát hành', sign: '', style: '' },
    { name: 'Điều chỉnh hiệu lực', value: summary.adjustmentAmount, note: 'Tăng hoặc giảm khoản phải thu', sign: '+', style: '' },
    { name: 'Tiền đã phân bổ', value: summary.allocatedAmount, note: 'Đã gắn vào các hóa đơn', sign: '−', style: 'bridge-paid' },
    { name: 'Còn phải thu', value: summary.remainingAmount, note: 'Số dư hiện tại cần theo dõi', sign: '=', style: 'bridge-balance' },
  ]
  return <section className="balance-bridge" aria-labelledby="balance-bridge-title">
    <div className="bridge-intro"><div><div className="eyebrow">TỪ CHỨNG TỪ ĐẾN SỐ DƯ</div><h2 id="balance-bridge-title">Đối chiếu công nợ</h2></div><span>VND / Toàn bộ hóa đơn đã phát hành</span></div>
    <div className="bridge-flow">{steps.map((step, index) => <div className={`bridge-step ${step.style}`} key={step.name}><span className="bridge-sign" aria-hidden="true">{step.sign || '01'}</span><div><span className="bridge-label">{step.name}</span><strong>{money(step.value)}</strong><small>{step.note}</small></div><span className="bridge-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></div>)}</div>
    <div className="bridge-recovery"><div className="bridge-ring" style={{ background: `conic-gradient(#557c54 ${percent.toNumber()}%, #e1e7d6 0)` }} aria-hidden="true"><span>{adjusted.greaterThan(0) ? `${label}%` : '—'}</span></div><div className="bridge-recovery-text"><strong>{adjusted.greaterThan(0) ? `${label}% giá trị phải thu đã được phân bổ` : 'Chưa có giá trị phải thu sau điều chỉnh'}</strong><p>Giá trị sau điều chỉnh: <b>{money(adjusted.toFixed(2))} VND</b>. Khoản thu chưa phân bổ được theo dõi riêng trên phiếu thu.</p></div><a href="/payments" className="secondary">Đối chiếu phiếu thu ↗</a></div>
  </section>
}
