import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { keycloak, username, canReadInvoices, canReadPayments, canReadReminders, canReadAdjustments, canReadReports, canAdminUsers } from './auth'
import { Icon } from './Icons'
import type { IconName } from './Icons'
import './App.css'

type Section = 'overview' | 'customers' | 'invoices' | 'receivables' | 'payments' | 'reminders' | 'adjustments' | 'reports' | 'users'
function preference(name: string) { try { return localStorage.getItem(`fin05.ui.${name}`) === 'true' } catch { return false } }
function savePreference(name: string, value: boolean) { try { localStorage.setItem(`fin05.ui.${name}`, String(value)) } catch { /* Preferences are optional when storage is unavailable. */ } }
export function Workspace({ section, children }: { section: Section; children: ReactNode }) {
  const [compact, setCompact] = useState(() => preference('compact'))
  const [hideNotes, setHideNotes] = useState(() => preference('hideNotes'))
  const [term, setTerm] = useState('')
  const command = useRef<HTMLDialogElement>(null)
  function openCommand() {
    if (document.querySelector('dialog[open]')) return
    setTerm(''); command.current?.showModal()
  }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommand() }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  const [role] = [['admin', 'Quản trị viên'], ['accountant', 'Kế toán công nợ'], ['cashier', 'Nhân viên thu tiền'], ['sales', 'Nhân viên kinh doanh'], ['manager', 'Ban quản lý']].filter(([key]) => keycloak.hasRealmRole(key))
  const groups: { label: string; links: { key: Section; href: string; label: string; allowed: boolean }[] }[] = [
    { label: '01 / Hồ sơ & chứng từ', links: [
      { key: 'customers', href: '/', label: 'Khách hàng', allowed: true },
      { key: 'invoices', href: '/invoices', label: 'Hóa đơn', allowed: canReadInvoices() },
      { key: 'payments', href: '/payments', label: 'Phiếu thu', allowed: canReadPayments() },
    ] },
    { label: '02 / Theo dõi & đối chiếu', links: [
      { key: 'receivables', href: '/receivables', label: 'Công nợ', allowed: canReadInvoices() },
      { key: 'reminders', href: '/reminders', label: 'Nhắc nợ', allowed: canReadReminders() },
      { key: 'adjustments', href: '/adjustments', label: 'Điều chỉnh', allowed: canReadAdjustments() },
      { key: 'reports', href: '/reports', label: 'Báo cáo', allowed: canReadReports() },
    ] },
    { label: '03 / Quản trị', links: [
      { key: 'users', href: '/users', label: 'Người dùng', allowed: canAdminUsers() },
    ] },
  ]
  const navItem = (key: Section, href: string, label: string) => <a key={key} href={href} className={section === key ? 'nav-current' : 'nav-link'} aria-current={section === key ? 'page' : undefined}><Icon name={key as IconName} /><span>{label}</span>{section === key && <span className="nav-indicator" aria-hidden="true">↗</span>}</a>
  const index = ['overview', 'customers', 'invoices', 'payments', 'receivables', 'reminders', 'adjustments', 'reports', 'users'].indexOf(section)
  const context = {
    overview: ['Bàn làm việc', 'Bắt đầu từ số dư', 'Xem các khoản quá hạn trước, sau đó đối chiếu tiền chưa phân bổ.'],
    customers: ['Khách hàng', 'Hồ sơ trước chứng từ', 'Kiểm tra mã, tên và trạng thái khách hàng trước khi lập giao dịch.'],
    invoices: ['Hóa đơn', 'Kiểm tra trước phát hành', 'Bản nháp chưa phát sinh công nợ. Hóa đơn đã phát hành được khóa chỉnh sửa.'],
    payments: ['Phiếu thu', 'Thu tiền và phân bổ', 'Xác nhận khoản thu chưa làm giảm công nợ của hóa đơn khi chưa phân bổ.'],
    receivables: ['Công nợ', 'Đối chiếu số dư', 'Ưu tiên hóa đơn quá hạn còn số dư. Số liệu phản ánh công nợ hiện tại.'],
    reminders: ['Nhắc nợ', 'Ghi lại lần liên hệ', 'Theo dõi kết quả liên hệ thủ công; ứng dụng chưa tự gửi email hoặc tin nhắn.'],
    adjustments: ['Điều chỉnh', 'Giữ lịch sử chứng từ', 'Tổng Nợ phải bằng tổng Có. Khi sửa sai chứng từ đã ghi nhận, thực hiện nghiệp vụ đảo.'],
    reports: ['Báo cáo', 'Thống nhất phạm vi lọc', 'Đối chiếu cùng khách hàng và thời hạn. Báo cáo sử dụng số dư hiện tại.'],
    users: ['Người dùng', 'Phân quyền theo công việc', 'Kiểm tra đúng danh tính, vai trò và trạng thái trước khi lưu thay đổi.'],
  }[section]
  const commands = [{ key: 'overview', href: '/overview', label: 'Bàn làm việc', allowed: true }, ...groups.flatMap(group => group.links)].filter(link => link.allowed)
  const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
  const results = commands.filter(link => normalize(link.label).includes(normalize(term)))
  return <div className={`workspace folio-workspace ${compact ? 'view-compact' : ''} ${hideNotes ? 'notes-hidden' : ''} theme-modern`}>
    <a className="skip-link" href="#main-content">Đến nội dung chính</a>
    <header className="folio-header">
      <a className="brand" href="/overview" aria-label="FIN05 bàn làm việc"><span className="brand-mark"><Icon name="book" size={26} /></span><span>Sổ công nợ<small>FIN05 / RECEIVABLES</small></span></a>
      <div className="folio-masthead"><span>HÓA ĐƠN & CÔNG NỢ PHẢI THU</span><strong>Chứng từ rõ ràng. Số dư minh bạch.</strong></div>
      <div className="folio-edition"><span>NGÀY LÀM VIỆC</span><time>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())}</time></div>
    </header>
    <nav className="folio-navigation" aria-label="Điều hướng chính">
      {navItem('overview', '/overview', 'Bàn làm việc')}
      {groups.map(group => group.links.some(link => link.allowed) && <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.links.filter(link => link.allowed).map(link => navItem(link.key, link.href, link.label))}</div>)}
    </nav>
    <div className="desk-controlbar"><button className="command-launch" onClick={openCommand}><span>⌕</span> Chuyển nhanh đến chức năng <kbd>Ctrl K</kbd></button><div className="desk-view-controls"><span>Góc làm việc</span><button aria-pressed={compact} onClick={() => { setCompact(!compact); savePreference('compact', !compact) }}>{compact ? 'Bảng gọn' : 'Bảng rộng'}</button><button aria-pressed={!hideNotes} aria-controls="context-notes" onClick={() => { setHideNotes(!hideNotes); savePreference('hideNotes', !hideNotes) }}>{hideNotes ? 'Hiện ghi chú' : 'Ẩn ghi chú'}</button></div></div>
    <div className="folio-body">
      <main id="main-content" tabIndex={-1}>{children}</main>
      <aside id="context-notes" className="folio-sidebar" aria-label="Ghi chú đối chiếu" hidden={hideNotes}>
        <div className="folio-page-marker"><span>MỤC NGHIỆP VỤ</span><strong>{String(index + 1).padStart(2, '0')}</strong><small>{context[0]}</small></div>
        <section className="folio-context"><span className="folio-side-label">GHI CHÚ TẠI BÀN</span><Icon name={section as IconName} size={26} /><h2>{context[1]}</h2><p>{context[2]}</p></section>
        <div className="folio-equation"><span className="folio-side-label">NGUYÊN TẮC ĐỐI CHIẾU</span><p>Hóa đơn phát hành</p><p>+ Điều chỉnh có hiệu lực</p><p>− Tiền đã phân bổ</p><strong>= Công nợ còn lại</strong></div>
        <div className="folio-side-links"><span className="folio-side-label">CHUYỂN NHANH</span><a href="/overview">Về bàn làm việc <Icon name="arrow" size={16} /></a>{canReadReports() && <a href="/reports">Mở sổ báo cáo <Icon name="arrow" size={16} /></a>}</div>
      </aside>
    </div>
    <dialog className="command-dialog" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); command.current?.close() } }} ref={command} aria-labelledby="command-title"><div className="command-heading"><div><span className="eyebrow">ĐIỀU HƯỚNG NGHIỆP VỤ</span><h2 id="command-title">Bạn muốn mở sổ nào?</h2></div><button className="close-button" aria-label="Đóng chuyển nhanh" onClick={() => command.current?.close()}>×</button></div><div className="command-search"><label className="sr-only" htmlFor="command-search">Tìm chức năng</label><input id="command-search" type="search" value={term} onChange={event => setTerm(event.target.value)} placeholder="Nhập tên chức năng, có hoặc không dấu…" /></div><nav className="command-results" aria-label="Kết quả chuyển nhanh">{results.map((link, i) => <a key={link.key} href={link.href}><Icon name={link.key as IconName} /><span>{link.label}{section === link.key && <small>Đang mở</small>}</span><span className="command-order">{String(i + 1).padStart(2, '0')} ↗</span></a>)}{!results.length && <p role="status">Không có chức năng phù hợp với từ khóa và quyền truy cập của bạn.</p>}</nav><div className="command-help"><span><kbd>Tab</kbd> Chọn chức năng · <kbd>Enter</kbd> Mở</span><span><kbd>Esc</kbd> Đóng</span></div></dialog>
    <footer className="folio-footer"><div className="folio-footer-brand"><Icon name="book" size={20} /><span>FIN–05<small>Phát hành hóa đơn mô phỏng</small></span></div><div className="user-menu"><div className="user-identity"><span className="user-avatar" aria-hidden="true">{username().trim().slice(0, 1).toUpperCase()}</span><span>{username()}<small>{role?.[1] ?? 'Người dùng nội bộ'}</small></span></div><button className="text-button" onClick={() => void keycloak.accountManagement()}>Tài khoản & mật khẩu</button><button className="text-button logout-button" onClick={() => void keycloak.logout({ redirectUri: window.location.origin })}>Đăng xuất</button></div><a className="folio-back-top" href="#main-content">Lên đầu trang ↑</a></footer>
  </div>
}
