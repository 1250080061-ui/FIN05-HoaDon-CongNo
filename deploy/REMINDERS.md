# Quản lý nhắc nợ (UC10)

## Sử dụng

1. Đăng nhập `ketoan01` hoặc `admin01`, chọn **Nhắc nợ** (http://localhost:5173/reminders).
2. Tab **Hóa đơn cần nhắc** lấy hóa đơn đã phát hành, còn số dư dương và có hạn thanh toán không sau 7 ngày tới. Lọc quá hạn hoặc đến hạn trong 7 ngày; hôm nay chưa quá hạn, ngày thứ 7 được tính, ngày thứ 8 chưa được tính. Ngày nghiệp vụ theo Asia/Ho_Chi_Minh.
3. Chọn **Lập nhắc nợ**. Kiểm tra khách hàng, số dư, hạn thanh toán; nhập ngày dự kiến liên hệ (hôm nay đến 30 ngày tới), kênh, thông tin liên hệ và nội dung. Nội dung gợi ý có thể chỉnh trước khi lưu.
4. **Kiểm tra nhắc nợ → Xác nhận tạo nhắc nợ** lưu thông báo nội bộ. Có thể quay lại chỉnh hoặc hủy trước khi xác nhận. Không gửi email/SMS hoặc gọi điện tự động.
5. Sau khi thực hiện liên hệ bên ngoài hệ thống, mở chi tiết → **Ghi nhận đã liên hệ**, nhập kết quả → **Xác nhận đã liên hệ**. Thời điểm ghi nhận do máy chủ lưu (UTC, giao diện hiển thị theo trình duyệt).
6. Chọn **Đóng thông báo**, nhập lý do để kết thúc đợt xử lý. Có thể đóng trực tiếp khi chưa liên hệ; không tạo kết quả liên hệ giả. Thông báo đóng không sửa hoặc mở lại. Hóa đơn vẫn còn thuộc diện cần nhắc thì có thể lập đợt mới, giữ lịch sử đợt cũ.
7. Tab **Lịch sử nhắc nợ** lọc số hóa đơn, mã/tên khách, trạng thái, khoảng ngày dự kiến; nút **Lịch sử** ở từng hóa đơn lọc riêng hóa đơn đó. Chi tiết hiển thị nội dung, kết quả, lý do đóng và người/thời điểm từng thao tác.

## Quyền và quy tắc

- admin/accountant: xem, tạo, liên hệ, đóng. manager: chỉ xem. sales/cashier: không có quyền. Backend kiểm tra quyền và trạng thái tài khoản, không chỉ ẩn nút.
- Số dư = hóa đơn đã phát hành + điều chỉnh Posted có dấu − tổng phân bổ. Dùng ReceivableBalances chung với màn hình Công nợ và phân bổ; Draft/Reversed không có hiệu lực ròng. Hóa đơn đã tất toán bằng điều chỉnh không còn trong danh sách cần nhắc; nếu đảo giảm làm số dư dương thì được xét lại theo hạn thanh toán.
- Khách hàng ngừng hoạt động vẫn có thể được xử lý khoản nợ lịch sử. Không tự xóa hóa đơn hoặc nhắc nợ vì khách hàng ngừng hoạt động.
- Mỗi hóa đơn chỉ có một thông báo Open/Contacted. Unique filtered index trên InvoiceId với Status khác Closed và khóa hóa đơn ngăn tạo trùng đồng thời.
- Khi tạo cần InvoiceRowVersion hiện hành: phân bổ thanh toán làm phiên bản hóa đơn đổi, yêu cầu cũ trả 409. Kiểm tra lại trạng thái Issued, số dư > 0 và hạn thanh toán trong giao dịch.
- Khi chuyển trạng thái cần RowVersion hiện hành của thông báo. Open → Contacted → Closed hoặc Open → Closed. Không ghi nhận liên hệ lần nữa, không mở lại thông báo Closed.
- Nếu đã trả đủ sau khi lập nhắc: lịch sử và số dư khi tạo được giữ lại; số dư hiện tại = 0. Không cho ghi nhận liên hệ mới; vẫn được đóng với lý do đã thanh toán. Hệ thống không tự đánh dấu đã liên hệ hoặc tự đóng.
- Tạo/chuyển trạng thái khóa hóa đơn trước rồi thông báo, cùng thứ tự để tránh xung đột với yêu cầu khác. Thay đổi và AuditLogs Reminder.Create/Contact/Close nằm trong cùng transaction; lỗi nhật ký hoàn tác cả dữ liệu và RowVersion. Số dư không thay đổi do thao tác nhắc nợ.
- Nội dung tối đa 4000 ký tự, thông tin liên hệ 254, kết quả/lý do 1000. Kênh Phone/Email/Other; Email cần địa chỉ hợp lệ; các thông tin bắt buộc không được chỉ chứa khoảng trắng.

## API

- `GET /api/reminders/candidates?search=&due=All|Overdue|Upcoming&page=1&pageSize=20`: hạn trong 7 ngày hoặc quá hạn; trả asOfDate, upcomingDays, số dư, phiên bản hóa đơn và activeReminderId nếu đang xử lý. Có phân trang, pageSize tối đa 100.
- `GET /api/reminders?search=&status=Open|Contacted|Closed&invoiceId=&fromDate=&toDate=&page=1&pageSize=20`: lịch sử, khoảng ngày lọc theo ScheduledDate, không phải ngày tạo UTC.
- `GET /api/reminders/{id}`: `{ detail, history }`. detail có số dư hiện tại và số dư lúc tạo; history có hành động/người/thời điểm theo thứ tự.
- `POST /api/reminders`: invoiceId, invoiceRowVersion (base64), scheduledDate (yyyy-MM-dd), content, contactChannel, contactInfo.
- `POST /api/reminders/{id}/contact` hoặc `/close`: rowVersion, note (kết quả liên hệ hoặc lý do đóng).

Không có endpoint gửi thông báo bên ngoài, xóa lịch sử hoặc sửa nội dung đã tạo. Thông tin liên hệ lưu trên nhắc nợ để việc sửa hồ sơ khách hàng sau này không thay đổi địa chỉ đã dùng trong đợt xử lý.

## Kiểm tra

8 kịch bản trong `frontend/tests/reminders.spec.ts`: ranh giới ngày và phân trang, trạng thái/lịch sử/người thực hiện, dữ liệu sai, thay đổi số dư/thanh toán đủ/khách ngừng hoạt động, hai yêu cầu đồng thời, hoàn tác khi nhật ký lỗi, phân quyền và giao diện máy tính/điện thoại. Dữ liệu và constraint thử nghiệm được dọn theo mã riêng, không xóa dữ liệu người dùng.
