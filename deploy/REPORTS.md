# Báo cáo thống kê và CSV (UC12)

## Thao tác

Đăng nhập `ketoan01`, `quanly01` hoặc `admin01`, mở **Báo cáo** (http://localhost:5173/reports).

1. Chọn Công nợ hiện tại, Hóa đơn quá hạn hoặc Thu tiền.
2. Nhập từ khóa (số chứng từ, mã/tên khách hàng), khoảng ngày và/hoặc chọn riêng khách hàng. Tìm khách hàng để chọn hiển thị tối đa 20 kết quả, gồm khách ngừng hoạt động. Có thể bỏ trống để lấy tất cả.
3. Bấm **Xem báo cáo**. Phần phạm vi dưới bộ lọc ghi rõ điều kiện đã áp dụng, thời điểm lập và ngày nghiệp vụ. Sửa ô lọc chưa tự thay kết quả; có thông báo yêu cầu bấm Xem báo cáo.
4. Xem các tổng cộng trên toàn bộ bộ lọc, nhóm tuổi nợ và chi tiết 10 dòng/trang. Đổi trang không thay tổng cộng.
5. **Xuất CSV** xuất toàn bộ kết quả theo điều kiện đã áp dụng, kể cả khi đang ở trang sau hoặc đã sửa ô lọc mà chưa áp dụng. Xuất tổng hợp lại dữ liệu tại thời điểm xuất; file có thời điểm riêng nên có thể khác màn hình nếu có người ghi nghiệp vụ sau lúc xem.
6. **Tải lại** tổng hợp lại điều kiện đã áp dụng. **Xóa bộ lọc** trở về công nợ hiện tại, tất cả khách hàng/ngày. Trên điện thoại bảng có thể kéo ngang.

## Ý nghĩa số liệu

### Công nợ hiện tại

Chỉ hóa đơn Issued. Dùng ReceivableBalances chung với màn hình Công nợ, phân bổ, điều chỉnh và nhắc nợ:

```text
Còn phải thu = Giá trị hóa đơn gốc
            + Tổng SignedAmount của điều chỉnh Posted
            - Tổng phân bổ thanh toán
```

Draft/Cancelled không tính; điều chỉnh Draft/Reversed không có hiệu lực ròng; phiếu thu chưa phân bổ không trừ vào hóa đơn. Gồm cả hóa đơn đã tất toán để đối chiếu giá trị gốc và các khoản đã xử lý. Khách ngừng hoạt động vẫn giữ lịch sử.

Khoảng ngày lọc **DueDate (hạn thanh toán)**, bao gồm hai đầu. Ví dụ chọn hạn từ 01–30/11 lấy các hóa đơn có hạn trong khoảng đó, nhưng tính toàn bộ điều chỉnh/phân bổ hiện có của các hóa đơn ấy. Không phải số dư tại cuối tháng 11 hoặc báo cáo phát sinh theo ngày lập hóa đơn.

### Hóa đơn quá hạn

Cùng công thức trên, thêm DueDate < ngày hiện tại ở Việt Nam và RemainingAmount > 0. Hạn hôm nay chưa quá hạn; đã tất toán không quá hạn. Lọc ngày vẫn theo DueDate.

Tuổi nợ tính theo ngày lịch: chưa quá hạn (gồm hôm nay), 1–30, 31–60, 61–90 và trên 90 ngày. Chỉ hóa đơn còn dư được đưa vào tuổi nợ; các nhóm cộng bằng tổng còn phải thu của bộ lọc. Với báo cáo quá hạn nhóm chưa quá hạn bằng 0.

### Thu tiền

Chỉ Payments.Status=Confirmed. Khoảng ngày lọc **PaymentDate (ngày thu)**, bao gồm hai đầu. Không tính Draft. Tiền mỗi phiếu chỉ cộng một lần dù phiếu có nhiều phân bổ.

Đã/chưa phân bổ là trạng thái **hiện tại** của các phiếu có ngày thu trong khoảng chọn; có thể bao gồm phân bổ thực hiện sau khoảng ngày đó. Ví dụ phiếu thu ngày 01/11 được phân bổ ngày 13/11: báo cáo ngày thu 01/11 vẫn hiển thị khoản đã phân bổ hiện tại. Đây không phải báo cáo dòng tiền hoặc phát sinh phân bổ theo kỳ.

```text
Chưa phân bổ = Giá trị phiếu thu đã xác nhận - Tổng phân bổ của phiếu
```

## Quyền và tính nhất quán

- Reports.Read: admin/accountant/manager được xem và xuất; sales/cashier không được truy cập. Khách chưa đăng nhập nhận 401. API và xuất CSV dùng cùng chính sách.
- Các endpoint chỉ đọc, không sửa chứng từ hoặc công nợ, không ghi nhật ký nghiệp vụ mới. Đồng bộ hồ sơ người dùng vẫn theo middleware xác thực chung.
- Mỗi yêu cầu tổng hợp, tuổi nợ và chi tiết trong một transaction đọc Serializable để nhất quán giữa các phần. Ngày nghiệp vụ theo Asia/Ho_Chi_Minh; generatedAt là UTC. Xem lại/xuất là một yêu cầu mới với thời điểm riêng.
- Tiền tính bằng decimal trên Backend, trả chuỗi 2 chữ số thập phân; frontend định dạng bằng Decimal.js. Nhóm tuổi nợ trên giao diện chỉ dùng tỷ lệ hiển thị, không dùng số thực để tính tổng tiền.
- Không có dữ liệu thì total=0, các tổng bằng 0, items rỗng. Lỗi truy vấn hiển thị trạng thái lỗi/thử lại, không dùng tổng tiền cũ. Chưa có báo cáo lịch sử tại ngày quá khứ, XLSX/PDF hoặc sổ cái đầy đủ.

## CSV

- UTF-8 có BOM để giữ tiếng Việt, phân cách dấu phẩy, tiền dùng dấu chấm thập phân, không có dấu phân cách hàng nghìn. Có thể mở bằng trình nhập CSV của Excel, chọn UTF-8 và dấu phẩy nếu thiết lập vùng không tự nhận.
- File có tên loại báo cáo/thời điểm, phần đầu ghi phạm vi lọc, ngày nghiệp vụ, mốc lập UTC và đơn vị VND; bảng chi tiết, dòng TỔNG; công nợ có thêm nhóm tuổi nợ.
- Tất cả ô được bao bằng dấu nháy kép, nháy kép bên trong được nhân đôi; xuống dòng và dấu phẩy trong tên khách vẫn giữ trong cùng ô. Các ô văn bản có thể bị đọc thành công thức được thêm dấu nháy đơn. Tiền do máy chủ tạo vẫn là giá trị số, bao gồm điều chỉnh âm.
- Tối đa 10.000 dòng chi tiết mỗi lần xuất; quá giới hạn trả lỗi yêu cầu thu hẹp bộ lọc, không cắt file âm thầm. Phân trang không giới hạn nội dung xuất. Báo cáo rỗng vẫn xuất được phần đầu/bảng/tổng 0.

## API

- `GET /api/reports?type=Receivables|Overdue|Collections&customerId=&search=&fromDate=&toDate=&page=1&pageSize=20`.
- `GET /api/reports/export`: cùng bộ lọc; page/pageSize được kiểm tra hợp lệ nhưng xuất tất cả dòng phù hợp, tối đa 10.000.
- Ngày yyyy-MM-dd; pageSize tối đa 100, search tối đa 200 ký tự, customerId dương. fromDate không sau toDate. Không giới hạn bộ lọc hạn thanh toán ở ngày hiện tại (được chọn hạn tương lai).
- JSON: reportType, generatedAt, asOfDate, basis, filters, total/page/pageSize, summary, aging, items. basis là DueDateCurrentBalance hoặc PaymentDateCurrentAllocation.
- summary có originalAmount, adjustmentAmount, allocatedAmount, remainingAmount, overdueAmount, collectedAmount, unallocatedAmount, count. Chỉ tiêu không áp dụng cho loại báo cáo trả 0.

## Kiểm tra

8 kịch bản `frontend/tests/reports.spec.ts`: đối chiếu số dư xuyên nghiệp vụ, ranh giới tuổi nợ/ngày lọc/khách ngừng hoạt động, tiền thu không nhân theo phân bổ, báo cáo rỗng và bộ lọc sai/không ghi dữ liệu, CSV nhiều trang/BOM/tiếng Việt/công thức/giới hạn dòng, quyền các vai trò, luồng xem/xuất với bộ lọc đã áp dụng/điện thoại và lỗi/thử lại.

Ca kiểm tra giới hạn xuất tạo 10.001 hóa đơn SQL riêng cho khách thử, rồi dọn bằng đúng mã đã tạo. Không đưa dữ liệu thử vào báo cáo thật sau khi suite kết thúc; không xóa hoặc đổi mật khẩu/tài khoản người dùng.
