# Giao diện Sổ công nợ FIN05

## Mục đích thiết kế

Giao diện tập trung vào câu hỏi nghiệp vụ: còn phải thu bao nhiêu, khoản nào đã quá hạn, tiền nào chưa phân bổ và chứng từ nào đang là bản nháp. Nền giấy ngà, xanh rêu và đường kẻ mảnh lấy ý tưởng từ sổ theo dõi kế toán; đỏ gạch dùng cho số dư quá hạn. Mã chứng từ và tiền trong bảng sử dụng kiểu chữ có độ rộng cố định để dễ đối chiếu. Hình minh họa trên trang vào hệ thống là sổ nghiệp vụ được dựng bằng HTML/CSS, không phải dữ liệu báo cáo.

Header đặt ngang như đầu trang sổ; menu nghiệp vụ là dải tab bên dưới, chia thành hồ sơ/chứng từ, theo dõi/đối chiếu và quản trị. Nội dung chính nằm bên trái, cột lề bên phải có số mục, ghi chú riêng theo nghiệp vụ và công thức đối chiếu. Thông tin tài khoản, đổi mật khẩu, đăng xuất và liên kết lên đầu trang đặt tại footer. Nút lưu, xác nhận, phát hành, phân bổ, ghi nhận và đảo điều chỉnh giữ nguyên ý nghĩa nghiệp vụ. Các hộp thoại dùng cùng phong cách chứng từ, không thay đổi API hoặc quy tắc tính tiền.

## Bàn làm việc

Đường dẫn /overview; đường dẫn / vẫn mở Khách hàng để giữ các liên kết hiện có.

- Admin, kế toán và quản lý: số dư hiện tại, tổng quá hạn, tiền chưa phân bổ từ phiếu đã xác nhận, số hóa đơn nháp; tối đa 6 hóa đơn quá hạn theo hạn thanh toán sớm nhất; 5 nhóm tuổi nợ.
- Thu tiền: tổng phiếu thu, số phiếu nháp và danh sách phiếu thu.
- Kinh doanh: tổng hồ sơ khách hàng và số khách đang hoạt động.

Các nút thao tác hiển thị theo quyền. Vai trò được kiểm tra ở giao diện và API tiếp tục quyết định quyền thực hiện. Bàn làm việc không tự gọi API báo cáo/công nợ/hóa đơn cho kinh doanh hoặc thu tiền.

Số liệu lấy từ API thật và dùng số tiền dạng decimal; không có chỉ số tăng trưởng hoặc lịch sử doanh thu giả. Còn phải thu và biểu đồ tuổi nợ dùng cùng báo cáo hiện tại. Tiền chưa phân bổ tính trên toàn bộ phiếu thu đã xác nhận, không phải riêng hôm nay. Bấm Cập nhật số liệu để lấy lại; không có tự động làm mới định kỳ hoặc báo cáo chốt sổ quá khứ. Các nhóm dữ liệu tải qua những yêu cầu riêng, không phải ảnh chụp giao dịch chung tại cùng một thời điểm. Khi lỗi tải, giao diện báo lỗi thay vì thay số thiếu bằng 0.

## Màn hình nhỏ và khả năng sử dụng

Điều hướng cho cuộn ngang; bảng giữ đủ các cột và cho cuộn trong vùng bảng. Cột ghi chú chuyển xuống dưới nội dung trên màn hình hẹp. Biểu mẫu chuyển một cột, hộp thoại giới hạn chiều cao và cuộn nội dung; người dùng vẫn tiếp cận được nút xác nhận. Có nhãn trường, trạng thái không chỉ phân biệt bằng màu, viền focus bàn phím, liên kết bỏ qua điều hướng và tôn trọng reduced motion.

## Kiểm tra

Ngày 14/11/2026: 71 ca nghiệp vụ cũ và 3 ca bàn làm việc đạt. Ba ca mới kiểm tra số dư so với API, mở đúng bộ lọc quá hạn, tránh gọi dữ liệu ngoài quyền và điều hướng trên điện thoại. Build TypeScript/Vite và ESLint đạt. Rà soát trực quan các màn hình trên Edge ở kích thước desktop 1440px và điện thoại 390px; không ghi nhận lỗi JavaScript hoặc tràn ngang toàn trang trong lượt rà soát.

Trang nhập thông tin xác thực và quản lý tài khoản do Keycloak cung cấp vẫn sử dụng theme của Keycloak. Thay đổi lần này áp dụng cho giao diện ứng dụng React, không thay cấu hình bảo mật hoặc mật khẩu. Báo cáo Word và ảnh thiết kế Chương 6 chưa được thay tự động theo giao diện mới.

## Tùy chỉnh góc làm việc

Thanh công cụ dưới menu cho phép chọn Bảng gọn/Bảng rộng và ẩn/hiện ghi chú đối chiếu. Hai lựa chọn được lưu dưới khóa fin05.ui trong localStorage của trình duyệt, chỉ chứa tùy chọn giao diện và không chứa thông tin đăng nhập. Khi trình duyệt không cho lưu, tùy chọn vẫn dùng được trong trang hiện tại.

Chuyển nhanh mở bằng nút hoặc Ctrl+K (Cmd+K). Tìm theo tên chức năng có hoặc không dấu; kết quả chỉ gồm các trang người dùng có quyền xem. Dùng Tab và Enter để mở, Esc để đóng. Phím tắt không mở đè lên hộp thoại chứng từ đang mở. Đây là tìm chức năng, không phải tìm dữ liệu khách hàng hay chứng từ.

Ca kiểm thử workbench bổ sung kiểm tra tìm không dấu, giới hạn kết quả theo quyền, đóng bằng Esc và lưu lựa chọn bố cục qua điều hướng. Build/lint và ca này đã đạt sau khi xử lý phím Esc của ô tìm kiếm. Ba ca bàn làm việc cũng đạt trong lượt nâng cấp này; không chạy lại toàn bộ các ca nghiệp vụ cũ ở lượt chỉ đổi góc làm việc.

## Phong cách hiển thị

Ứng dụng sử dụng duy nhất giao diện Hiện đại: nền sáng, xanh mực, tiêu đề sans-serif. Không có nút đổi sang Sổ giấy; tùy chọn fin05.ui.modern cũ không còn được đọc. Mật độ bảng và trạng thái ghi chú vẫn được ghi nhớ độc lập.
