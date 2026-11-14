# Phát hành mô phỏng và công nợ phải thu

## Dùng trên giao diện

Đăng nhập `ketoan01` hoặc `admin01`:

1. Mở **Hóa đơn**, lập một bản nháp có khách hàng đang hoạt động, ít nhất một dòng chi tiết và tổng tiền lớn hơn 0.
2. Mở **Chi tiết → Phát hành mô phỏng**. Kiểm tra số tiền và bấm **Xác nhận phát hành**. Bấm Quay lại nếu chưa muốn phát hành.
3. Sau khi thành công, hóa đơn có số SIM, thời điểm phát hành và trạng thái Đã phát hành; không còn nút sửa/hủy nháp.
4. Mở **Công nợ** hoặc `http://localhost:5173/receivables`. Tìm theo số hóa đơn hoặc mã/tên khách hàng, lọc quá hạn/chưa quá hạn và xem chi tiết.

Ban quản lý (`quanly01`) được xem hóa đơn và công nợ, không phát hành. Kinh doanh và thu tiền hiện không được xem các màn hình này. Quyền được kiểm tra tại API, không chỉ ẩn nút.

## Quy tắc phát hành

- Chỉ Draft mới được phát hành. Cần RowVersion mới nhất; bản cũ trả 409 và giữ dữ liệu cũ để người dùng tải lại/đối chiếu.
- Kiểm tra lại khách hàng hoạt động, các dòng hàng, độ chính xác số lượng/đơn giá, số tiền tính lại và hạn thanh toán. Hóa đơn nháp trống, tổng bằng 0 hoặc dữ liệu tiền không khớp không được phát hành.
- Số hóa đơn mô phỏng: `SIM-{năm tại Việt Nam}-{InvoiceId đệm tối thiểu 10 chữ số}`. Số duy nhất nhờ định danh hóa đơn và chỉ mục UNIQUE; không cam kết dãy số liên tục. Đây không phải quy tắc số hóa đơn pháp lý.
- IssuedAt lưu UTC, hiển thị theo múi giờ trình duyệt. Ngày nghiệp vụ/quá hạn tính theo Asia/Ho_Chi_Minh, không phụ thuộc múi giờ máy chạy Backend. BusinessClock dùng TimeProvider để có thể thay đồng hồ trong kiểm thử sau này.
- Ghi trạng thái, số, thời điểm và AuditLogs (`Invoice.Issue`) trong một transaction. Lỗi ghi nhật ký hoàn tác toàn bộ; nháp còn nguyên và chưa xuất hiện công nợ. Không gửi thông báo hoặc gọi dịch vụ thuế bên ngoài.
- Hai yêu cầu cùng phát hành một nháp chỉ một yêu cầu thành công; yêu cầu còn lại trả 409. Phát hành lại hóa đơn đã Issued cũng bị từ chối.
- SQL CHECK CK_Invoices_IssueFields giữ trạng thái và các trường phát hành nhất quán: Issued cần số, thời điểm và tổng tiền dương; Draft/Cancelled phải chưa có số/thời điểm phát hành.
- Khách hàng ngừng hoạt động bị chặn phát hành mới, nhưng hóa đơn đã phát hành và khoản phải thu vẫn được giữ nguyên để truy vết.

## Công nợ hiện tại

Chỉ lấy hóa đơn Issued, không tạo bảng số dư Receivables trùng lặp. Mỗi hóa đơn đã phát hành là một khoản phải thu trong truy vấn. Sửa trạng thái nháp không ảnh hưởng công nợ; không xóa dữ liệu lịch sử.

Đã có phiếu thu/phân bổ (xem [hướng dẫn](PAYMENTS.md)) và [điều chỉnh có chứng từ](ADJUSTMENTS.md):

```text
Giá trị ban đầu = Invoices.TotalAmount
Điều chỉnh hợp lệ = SUM(DebtAdjustments.SignedAmount WHERE Status = Posted)
Đã thanh toán qua phân bổ = SUM(PaymentAllocations.AllocatedAmount)
Còn phải thu = Giá trị ban đầu + Điều chỉnh hợp lệ - Đã thanh toán qua phân bổ
```

Chỉ phiếu thu Confirmed được phân bổ; sau xác nhận không được sửa phiếu hoặc xóa phân bổ. Tiền chưa phân bổ không giảm số dư hóa đơn. Điều chỉnh Draft/Reversed không có hiệu lực ròng. ReceivableBalances dùng chung công thức trong tra cứu, phân bổ, nhắc nợ và điều chỉnh. Trạng thái suy ra là Unpaid, PartiallyPaid hoặc Paid; nếu hết dư do điều chỉnh mà chưa phân bổ tiền thì là Settled (Đã tất toán). Hóa đơn không còn dư không quá hạn, overdueDays=0; overdue=false gồm cả hóa đơn đã tất toán.

Quá hạn khi ngày hiện tại ở Việt Nam lớn hơn DueDate và còn phải thu dương. Hạn hôm nay chưa quá hạn. Số ngày quá hạn là chênh lệch ngày lịch, không tính theo số giờ. Tổng số tiền và quá hạn phản ánh toàn bộ dữ liệu theo bộ lọc, không chỉ trang đang mở. API thực hiện các truy vấn tổng/chi tiết trong một transaction đọc Serializable để tránh các phần trả về lệch nhau khi đang có phát hành đồng thời.

## API

- `POST /api/invoices/{id}/issue`: body `{ "rowVersion": "base64..." }`, cần admin/accountant. Trả hóa đơn đã phát hành; không nhận số hóa đơn hoặc tổng tiền do client quyết định.
- `GET /api/receivables`: cần admin/accountant/manager. Các tham số: search, customerId, overdue (true/false), fromDueDate, toDueDate, page, pageSize (tối đa 100).
- Trả asOfDate, items, total, page, pageSize, summary. Các giá trị tiền là chuỗi thập phân. stage=PaymentsAndAdjustments; adjustmentAmount là tổng điều chỉnh có dấu còn hiệu lực.

## Kiểm tra

Có 6 kịch bản phát hành, 8 phiếu thu/phân bổ, 8 nhắc nợ, 9 điều chỉnh/chứng từ và 8 báo cáo/CSV trong tổng 71 kịch bản; gồm thêm 9 kịch bản quản trị người dùng, đối chiếu quyền và chặn truy cập. Bản ghi thử được dọn bằng mã riêng; không xóa dữ liệu người dùng.

Hệ thống hiện chỉ phát hành mô phỏng cho đồ án, không phải hóa đơn điện tử và không kết nối cơ quan thuế.
