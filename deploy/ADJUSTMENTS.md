# Điều chỉnh công nợ và chứng từ đối ứng (UC11)

## Thao tác

1. Đăng nhập `ketoan01` hoặc `admin01`, chọn **Điều chỉnh → Chọn hóa đơn điều chỉnh**. Tìm hóa đơn hoặc khách hàng. Có thể chọn cả hóa đơn đã tất toán nếu cần điều chỉnh tăng hợp lệ.
2. **Lập điều chỉnh**: nhập ngày không ở tương lai, số tiền có dấu (dương tăng/âm giảm), lý do và từ 2 đến 30 dòng bút toán. Nút **Gợi ý hai dòng đối ứng** thay bảng dòng hiện tại bằng hai dòng mô phỏng AR/ADJ; kiểm tra hoặc sửa trước khi lưu.
3. Mỗi dòng ghi tiền dương ở một bên Nợ/Có, bên kia bằng 0. Tổng Nợ = tổng Có. Tổng Nợ trừ Có trên tài khoản phải thu bằng số điều chỉnh; tăng ghi Nợ phải thu, giảm ghi Có phải thu.
4. **Kiểm tra điều chỉnh → Lưu điều chỉnh nháp**. Nháp không đổi công nợ, chưa tạo JournalEntries; có thể mở lại sửa nháp. Hóa đơn của bản nháp được cố định.
5. Mở chi tiết → **Ghi nhận điều chỉnh**. Xem số dư trước/sau → **Xác nhận ghi nhận**. Hệ thống kiểm tra lại số dư, phiên bản và tài khoản hoạt động, lưu chứng từ gốc cân bằng, trạng thái Posted và nhật ký trong cùng giao dịch. Điều chỉnh được khóa sửa.
6. Sửa sai: mở điều chỉnh Posted → **Đảo điều chỉnh**, nhập lý do → **Xác nhận đảo điều chỉnh**. Hệ thống tạo chứng từ Reversal bằng cách đổi Nợ/Có từng dòng gốc, chuyển Reversed và giữ nguyên chứng từ gốc. Không xóa, sửa số hoặc mở lại chứng từ cũ.
7. Lịch sử điều chỉnh lọc theo khách hàng, hóa đơn, ID và trạng thái. Chi tiết có chứng từ gốc/đảo, tổng Nợ/Có, người/thời điểm và lịch sử thao tác. Trên điện thoại bảng dòng có thể kéo ngang, nội dung chi tiết cuộn dọc.

## Quyền và phạm vi

- admin/accountant xem và ghi; manager chỉ xem; sales/cashier không được truy cập. Backend kiểm tra quyền và tài khoản hoạt động.
- AR (phải thu), ADJ và OTHER (đối ứng) là danh mục mô phỏng cho đồ án, không phải cấu hình tài khoản kế toán pháp lý. Chưa có màn hình cấu hình danh mục hoặc sổ cái đầy đủ cho hóa đơn/phiếu thu. Không tự áp dụng hạch toán thuế.
- AccountingAccounts có IsActive và IsReceivable; tài khoản mới ghi nhận phải hoạt động. Khi đảo giữ tài khoản lịch sử của chứng từ gốc kể cả tài khoản đã ngừng dùng; không thay tài khoản cũ bằng tài khoản khác.
- Chỉ hóa đơn Issued được chọn. Khách hàng ngừng hoạt động vẫn được xử lý khoản công nợ lịch sử.
- Hệ thống hiện cho phép sửa nháp; không có API xóa/huỷ nháp, đảo phiếu thu hoặc đảo phân bổ. Nếu đảo một điều chỉnh tăng sẽ làm số dư âm do tiền đã phân bổ, thao tác bị chặn; không tự sửa phân bổ hoặc tạo khoản âm để ép đảo.

## Tính nhất quán

```text
Còn phải thu = Invoices.TotalAmount
            + SUM(DebtAdjustments.SignedAmount với Status=Posted)
            - SUM(PaymentAllocations.AllocatedAmount)
```

Giá trị hóa đơn gốc không thay đổi. Draft không ảnh hưởng; Reversed đã có chứng từ gốc + đảo nên hiệu lực ròng bằng 0. ReceivableBalances dùng chung trong Công nợ, hóa đơn phân bổ, kiểm tra phân bổ và nhắc nợ.

- Số tiền khác 0, decimal(18,2), lý do bắt buộc tối đa 500 ký tự. Số dư sau ghi nhận/đảo phải từ 0 đến 9999999999999999.99; tổng Nợ/Có mỗi chứng từ cũng trong phạm vi này. Không tự làm tròn số tiền điều chỉnh quá 2 chữ số thập phân.
- Tạo/sửa nháp kiểm tra trước số dư dự kiến. Ghi nhận kiểm tra lại vì số dư có thể đã thay đổi. Cần phiên bản hóa đơn và bản điều chỉnh hiện hành; lỗi 409 yêu cầu tải lại để đối chiếu.
- Tất cả thao tác ghi khóa hóa đơn trước rồi điều chỉnh. Phân bổ cũng khóa hóa đơn trước khi chi số dư, nên thao tác đồng thời không thể cùng tiêu một số dư. Ghi nhận/đảo cập nhật RowVersion hóa đơn mà giữ nguyên TotalAmount.
- Tài khoản được đọc với HOLDLOCK trong transaction kiểm tra/ghi nhận để không bị ngừng dùng giữa chừng.
- Điều chỉnh, chứng từ, dòng, phiên bản và AuditLogs cùng transaction; lỗi nhật ký hoàn tác toàn bộ. JournalEntries có unique (AdjustmentId, EntryType), ngăn hai chứng từ gốc hoặc hai chứng từ đảo cho cùng điều chỉnh.
- SQL CHECK kiểm soát trạng thái/thời điểm, số điều chỉnh khác 0, và đúng một bên dương trên mỗi dòng. Kiểm tra tổng dòng và phần phải thu được thực hiện trong Backend; không có endpoint ghi trực tiếp JournalEntries/Lines.
- DebtAdjustmentLines giữ các dòng đề xuất của nháp, giữ nguyên sau Posted. JournalEntryLines là bản chụp hạch toán chính thức. Các khóa ngoại lịch sử dùng Restrict.
- Ngày nghiệp vụ là date; CreatedAt/PostedAt/ReversedAt và nhật ký là UTC, giao diện hiển thị theo trình duyệt. Chưa có báo cáo lịch sử “số dư tại ngày quá khứ”; các số dư trên giao diện là hiện tại.

## API

- `GET /api/adjustments/accounts`: tài khoản hoạt động, mã/tên và IsReceivable.
- `GET /api/adjustments/invoices?search=&page=1&pageSize=20`: hóa đơn Issued, giá trị gốc/điều chỉnh/đã phân bổ/số dư và invoiceRowVersion.
- `GET /api/adjustments?search=&status=Draft|Posted|Reversed&invoiceId=&page=1&pageSize=20`.
- `GET /api/adjustments/{id}`: `{ detail, history }`, gồm phiên bản hóa đơn, dòng nháp và chứng từ chính thức.
- `POST /api/adjustments`: invoiceId, invoiceRowVersion, adjustmentDate, signedAmount, reason, lines[{accountId,debitAmount,creditAmount}]. Tiền là chuỗi decimal.
- `PUT /api/adjustments/{id}`: các trường trên và rowVersion; chỉ Draft, không đổi InvoiceId.
- `POST /api/adjustments/{id}/post`: rowVersion, invoiceRowVersion.
- `POST /api/adjustments/{id}/reverse`: như post và note (lý do đảo).

## Kiểm tra

9 kịch bản trong `frontend/tests/adjustments.spec.ts`: nháp/sửa/ghi nhận/đảo, tài khoản và bút toán sai, giới hạn số dư/tiền, ghi nhận/đảo đồng thời, cạnh tranh phân bổ với điều chỉnh, hoàn tác lỗi nhật ký, đối chiếu số dư xuyên nghiệp vụ, phân quyền và giao diện máy tính/điện thoại. Dùng khách hàng/tài khoản kế toán thử riêng, dọn đúng bản ghi và constraint đã tạo; không thay danh mục hoặc mật khẩu người dùng.
