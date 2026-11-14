# Phiếu thu và phân bổ thanh toán (UC07–UC08)

## Thao tác

1. Đăng nhập `thutien01` (hoặc admin), chọn **Phiếu thu → Lập phiếu thu**. Chọn khách hàng hoạt động, ngày thu, số tiền dương và phương thức tiền mặt/chuyển khoản. Chuyển khoản cần mã tham chiếu.
2. **Lưu phiếu thu nháp**. Có thể sửa nháp; lưu nháp không làm giảm công nợ.
3. Mở chi tiết, **Xác nhận phiếu thu → Đồng ý xác nhận** sau khi đối chiếu tiền thực nhận. Phiếu được khóa sửa; chưa phân bổ thì chưa giảm công nợ.
4. Đăng nhập `ketoan01` (hoặc admin), mở phiếu đã xác nhận → **Phân bổ vào hóa đơn**. Nhập tiền cho một hoặc nhiều hóa đơn còn phải thu của cùng khách hàng. Danh sách có phân trang; lựa chọn được giữ qua các trang.
5. **Kiểm tra phân bổ**, xem lại từng hóa đơn/tổng tiền, rồi **Xác nhận phân bổ**. Có thể hủy trước khi xác nhận mà không ghi dữ liệu.
6. Chi tiết phiếu hiển thị tiền đã phân bổ, chưa phân bổ và lịch sử. Mở **Công nợ** để xem tiền đã phân bổ, số còn phải thu và trạng thái đã thanh toán.

Không đặt lại mật khẩu tài khoản. Dùng mật khẩu hiện tại nếu đã thay mật khẩu khởi tạo.

## Quyền

| Thao tác | admin | cashier | accountant | manager | sales |
|---|---|---|---|---|---|
| Xem phiếu / lịch sử | Có | Có | Có | Có | Không |
| Lập, sửa nháp, xác nhận | Có | Có | Không | Không | Không |
| Xem hóa đơn đủ điều kiện, phân bổ | Có | Không | Có | Không | Không |

API kiểm tra đầy đủ quyền và tài khoản hoạt động. Giao diện ẩn các thao tác không được phép.

## Quy tắc lưu

- Số phiếu `PT-{năm Việt Nam}-{PaymentId đệm tối thiểu 10 chữ số}` được cấp khi lập; UNIQUE, không cam kết liên tục. Số tạm nội bộ được thay trước khi commit. Đây là số chứng từ trong đồ án.
- Ngày thu không được ở tương lai; Amount là decimal(18,2), dương, tối đa 2 chữ số thập phân. Ngày thu là ngày lịch; thời điểm xác nhận/phân bổ lưu UTC.
- Khách hàng hoạt động được kiểm tra và khóa khi tạo/sửa/xác nhận. Phiếu đã xác nhận vẫn cho phân bổ công nợ lịch sử nếu khách hàng sau đó ngừng hoạt động.
- Trạng thái Draft → Confirmed. Confirmed không sửa, không có API xóa hoặc hủy; chưa có nghiệp vụ đảo phiếu/đảo phân bổ.
- Phân bổ chỉ nhận phiếu Confirmed, hóa đơn Issued cùng khách hàng, tiền dương, không trùng hóa đơn trong cùng yêu cầu. Tổng không vượt tiền chưa phân bổ; từng dòng không vượt số còn phải thu.
- Mỗi lần phân bổ khóa phiếu UPDLOCK/HOLDLOCK, sau đó khóa hóa đơn theo ID tăng dần. Cập nhật RowVersion phiếu và từng hóa đơn; bản cũ trả 409 để người dùng tải lại. Hai phiếu cạnh tranh một hóa đơn không được phân bổ vượt số dư.
- Tất cả phân bổ, phiên bản và AuditLogs cùng một transaction; lỗi một dòng hoặc nhật ký hoàn tác toàn bộ. Nhật ký Payment.CreateDraft/UpdateDraft/Confirm/Allocate lưu người thực hiện và dữ liệu trước/sau.
- Công nợ suy ra từ giá trị hóa đơn + điều chỉnh Posted có dấu − tổng phân bổ; dùng ReceivableBalances chung với nhắc nợ/điều chỉnh. Không lưu bảng số dư trùng lặp. Tiền chưa phân bổ giữ trên phiếu, chưa bù trừ công nợ hóa đơn. Ghi nhận/đảo điều chỉnh cũng đổi RowVersion hóa đơn; yêu cầu phân bổ cũ trả 409. Chưa kết nối ngân hàng/cổng thanh toán hay chứng từ thu tiền pháp lý.

## API

- `GET /api/payments?search=&status=Draft|Confirmed&page=1&pageSize=20` (pageSize tối đa 100).
- `GET /api/payments/{id}`: gồm khách hàng, người lập, RowVersion, các tổng tiền và lịch sử phân bổ.
- `POST /api/payments`: customerId, paymentDate (yyyy-MM-dd), amount (chuỗi decimal), paymentMethod (Cash/BankTransfer), referenceNumber.
- `PUT /api/payments/{id}`: như tạo và rowVersion.
- `POST /api/payments/{id}/confirm`: rowVersion.
- `GET /api/payments/{id}/available-invoices?page=1&pageSize=20`: hóa đơn còn phải thu cùng khách hàng, số dư và phiên bản.
- `POST /api/payments/{id}/allocations`: rowVersion của phiếu, items gồm invoiceId, rowVersion hóa đơn, amount. Tối đa 100 dòng mỗi yêu cầu.

Tiền trả về là chuỗi decimal. Các số dư gợi ý có thể thay đổi khi người khác thao tác; API kiểm tra lại trong giao dịch xác nhận. Không tự xác nhận bằng dữ liệu cũ khi nhận 409.

## Kiểm tra

`npm.cmd run test:e2e -- tests/payments.spec.ts`: dữ liệu không hợp lệ, khóa sửa/xác nhận lại, phân bổ nhiều hóa đơn/một phần/đủ, từ chối sai khách/nháp/vượt số dư/trùng dòng, hai yêu cầu cùng phiếu, hai phiếu cùng hóa đơn, hoàn tác khi nhật ký lỗi, quyền các vai trò và luồng giao diện. Dữ liệu thử dùng mã khách hàng riêng và dọn đúng các mã đã tạo.
