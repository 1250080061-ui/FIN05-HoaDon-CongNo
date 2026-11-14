import { keycloak } from './auth'
import { Icon } from './Icons'
import './App.css'

export function Login({ error = false }: { error?: boolean }) {
  return <main className="login-page">
    <section className="login-story" aria-label="Giới thiệu FIN05">
      <a className="login-wordmark" href="/"><Icon name="book" size={30} /><span>FIN05<small>SỔ NGHIỆP VỤ CÔNG NỢ</small></span></a>
      <div className="login-story-body"><div className="eyebrow">HÓA ĐƠN & CÔNG NỢ PHẢI THU</div><h1>Mỗi chứng từ,<br />một số dư rõ ràng.</h1><p>Từ hóa đơn phát hành đến khoản tiền được phân bổ. Theo dõi đúng hạn, đối chiếu đúng số.</p>
        <div className="ledger-illustration" aria-hidden="true"><div className="ledger-paper-back" /><div className="ledger-paper"><div className="ledger-paper-title"><span>FIN–05</span><span>SỔ THEO DÕI PHẢI THU</span></div><div className="ledger-paper-heading">Đối chiếu công nợ<span>CHỨNG TỪ / THANH TOÁN</span></div><div className="ledger-column-head"><span>Nghiệp vụ</span><span>Phải thu</span><span>Đã thu</span></div>{['Hóa đơn phát hành', 'Phân bổ thanh toán', 'Điều chỉnh công nợ'].map((label, i) => <div className="ledger-rule" key={label}><span><small>0{i + 1}</small>{label}</span><span /><span /></div>)}<div className="ledger-balance"><span>Số dư còn lại</span><strong>Đã đối chiếu <span>✓</span></strong></div></div><span className="ledger-stamp">THEO DÕI<br />ĐẾN TỪNG HÓA ĐƠN</span></div>
      </div>
    </section>
    <section className="login-entry"><div className="login-card"><span className="login-step">01 / TRUY CẬP HỆ THỐNG</span><div className="login-entry-icon"><Icon name="users" size={28} /></div><h2>{error ? 'Chưa thể đăng nhập' : 'Mở sổ làm việc'}</h2><p>{error ? 'Dịch vụ xác thực chưa phản hồi. Hãy kiểm tra kết nối và thử lại.' : 'Sử dụng tài khoản nội bộ để tiếp tục công việc của bạn.'}</p><button className="primary" onClick={() => error ? window.location.reload() : void keycloak.login({ redirectUri: window.location.origin + window.location.pathname })}>{error ? 'Thử lại' : 'Đăng nhập'}<Icon name="arrow" /></button><div className="login-access-note"><Icon name="users" size={18} /><span>Chức năng được hiển thị theo vai trò.<br />Liên hệ quản trị viên nếu bạn chưa có tài khoản.</span></div></div><footer className="login-entry-footer">Quản lý hóa đơn và công nợ phải thu<span>Phiên bản đồ án · Phát hành mô phỏng</span></footer></section>
  </main>
}
