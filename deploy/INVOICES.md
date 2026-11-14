# Quản lý hóa đơn nháp

## Dùng trên giao diện

Đăng nhập `ketoan01` hoặc `admin01`, chọn **Hóa đơn** ở menu trái, hoặc mở `http://localhost:5173/invoices`.

1. Bấm **Lập hóa đơn**.
2. Tìm và chọn một khách hàng đang hoạt động. Tìm theo mã hoặc tên; bộ chọn hiển thị tối đa 20 kết quả cho mỗi từ khóa, không phải toàn bộ danh sách.
3. Chọn ngày lập và hạn thanh toán.
4. Bấm **Thêm dòng**, nhập nội dung, số lượng và đơn giá. Có thể thêm/xóa dòng; bản nháp trống được phép lưu để bổ sung sau.
5. Bấm **Lưu nháp**. Màn hình chi tiết hiển thị dữ liệu đã lưu và tổng tiền được Backend tính lại.
6. Dùng **Chỉnh sửa nháp** để cập nhật. **Hủy bản nháp** yêu cầu xác nhận, giữ lại nội dung/nhật ký và khóa chỉnh sửa tiếp; không xóa dữ liệu.

Tài khoản kinh doanh chỉ quản lý khách hàng, không có quyền vào màn hình hóa đơn. Ban quản lý được xem hóa đơn, không lập/sửa/hủy. Thu tiền chưa có quyền vào màn hình này. Kế toán và quản trị viên được lập/sửa/hủy nháp.

## Phạm vi hiện tại

- Migration InvoiceDrafts tạo Invoices và InvoiceItems theo Chương 4; liên kết Customers và AppUsers, khóa ngoại bảo toàn dữ liệu.
- Invoices.InvoiceNumber để NULL khi nháp. Chỉ mục UNIQUE có bộ lọc cho phép nhiều bản nháp chưa có số. Mã giao diện “Nháp #id” là mã nội bộ, không phải số hóa đơn đã phát hành.
- IssueStatus lưu Draft, Issued hoặc Cancelled. Đã có phát hành mô phỏng và công nợ: xem [hướng dẫn](RECEIVABLES.md). Không có khoản phải thu phát sinh từ bản nháp.
- Không có endpoint xóa hóa đơn. Chỉ Draft được sửa/hủy; Issued hoặc Cancelled bị chặn với 409.
- Backend lấy người lập từ AppUsers của token đã xác thực. Sửa nháp không thay đổi người lập ban đầu; nhật ký ghi người thực hiện cập nhật thực tế.
- Tổng tiền từ client bị bỏ qua. Backend tính LineAmount = Quantity × UnitPrice, làm tròn từng dòng 2 chữ số bằng MidpointRounding.AwayFromZero, rồi cộng các dòng. Giao diện dùng decimal.js với độ chính xác 40 chữ số và ROUND_HALF_UP, tương ứng khi số tiền không âm.
- Số lượng dương, tối đa 3 chữ số thập phân và 999999999.999; đơn giá không âm, tối đa 2 chữ số thập phân và 999999999999.99. Giới hạn 200 dòng. Từng dòng và tổng tiền phải nằm trong DECIMAL(18,2). Không tự làm tròn số lượng/đơn giá nhập vượt độ chính xác; trả lỗi để sửa.
- API nhận quantity/unitPrice dạng chuỗi thập phân hoặc JSON number; trả quantity, unitPrice, lineAmount, totalAmount dạng chuỗi để tránh mất độ chính xác trong JavaScript. ID vẫn là số.
- Ngày là ngày lịch, không tự chuyển múi giờ; hạn thanh toán không được trước ngày lập.
- Chưa mô hình hóa thuế hoặc chiết khấu riêng; tổng hiện tại bằng tổng các dòng đã làm tròn.
- RowVersion chống ghi đè đồng thời, kể cả chỉ sửa mô tả hoặc các dòng mà tổng tiền không đổi. Khi bị 409, nội dung nhập được giữ lại để đối chiếu; đóng cửa sổ và tải lại trước khi cập nhật tiếp.
- Ghi hóa đơn, dòng chi tiết và nhật ký trong cùng transaction. Lỗi bất kỳ phần nào đều hoàn tác toàn bộ. Các hành động AuditLogs: Invoice.CreateDraft, Invoice.UpdateDraft, Invoice.CancelDraft, EntityName=Invoices. Chưa có màn hình lịch sử riêng cho hóa đơn; dữ liệu nhật ký đã lưu trong SQL Server.
- Khi lưu, Backend khóa đọc khách hàng cho đến khi giao dịch hoàn tất để kiểm tra trạng thái hoạt động nhất quán. Người dùng ngừng hoạt động bị chặn như các API khác.

## API

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| GET | /api/invoices?search=...&status=Draft&page=1&pageSize=20 | Tìm theo id nội bộ, số hóa đơn hoặc mã/tên khách hàng; lọc trạng thái, phân trang |
| GET | /api/invoices/{id} | Xem chi tiết và các dòng |
| POST | /api/invoices | Tạo nháp |
| PUT | /api/invoices/{id} | Cập nhật toàn bộ nháp, cần rowVersion |
| POST | /api/invoices/{id}/cancel | Hủy nháp, body chứa rowVersion |
| POST | /api/invoices/{id}/issue | Phát hành mô phỏng, body chứa rowVersion |

Các trường tạo/sửa: customerId, invoiceDate (yyyy-MM-dd), dueDate (yyyy-MM-dd), items[{description, quantity, unitPrice}]. Không nhận quyền, người lập hoặc trạng thái phát hành từ client. API ghi cần vai trò admin/accountant; đọc cần admin/accountant/manager.

## Kiểm tra

Chạy `npm.cmd run test:e2e` trong frontend khi các dịch vụ đang hoạt động. 6 kịch bản hóa đơn kiểm tra tính tiền/làm tròn, giá trị lớn vượt số nguyên an toàn của JS, bản nháp trống, chỉnh sửa, hủy, dữ liệu sai, độ chính xác, khách hàng ngừng hoạt động, phân quyền, chặn hóa đơn đã phát hành, hoàn tác khi ghi nhật ký lỗi và cập nhật đồng thời. Giao diện được kiểm tra cả màn hình điện thoại.

Ca kiểm tra khóa hóa đơn đã phát hành dùng dữ liệu thử được tạo riêng và đặt trạng thái qua SQL để xác minh quy tắc khóa, không phải chức năng phát hành thực tế. Dữ liệu và CHECK constraint thử nghiệm được dọn theo mã riêng. SQL helper bật các SET options cần thiết cho chỉ mục UNIQUE có bộ lọc.
