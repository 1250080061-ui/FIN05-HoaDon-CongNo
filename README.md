# FIN05 Hệ thống quản lý hóa đơn và công nợ phải thu

Giai đoạn hiện tại: giao diện React + TypeScript kết nối Backend ASP.NET Core Web API, C#, EF Core và SQL Server. Đã có Keycloak OIDC, phân quyền, quản lý khách hàng, đồng bộ AppUsers, nhật ký người thực hiện, hóa đơn nháp/chi tiết, phát hành mô phỏng, phiếu thu nháp/xác nhận, phân bổ thanh toán, điều chỉnh có bút toán gốc/đảo, theo dõi công nợ, nhắc nợ thủ công, báo cáo thống kê/xuất CSV và quản trị người dùng UC13. Đây là bản phát triển cục bộ cho đồ án, chưa triển khai sản xuất.

**Dùng ngay:** chạy `./Start-FIN05.ps1`, mở `http://localhost:5173`, đăng nhập `kinhdoanh01` bằng mật khẩu hiện tại của bạn. File `.local/Tai-khoan-thu-nghiem.txt` chỉ chứa mật khẩu khởi tạo, không tự đổi theo mật khẩu bạn đã cập nhật. Xem [hướng dẫn Keycloak](deploy/KEYCLOAK.md) để biết các tài khoản và quyền.

**Bàn giao/cài máy mới:** xem [hướng dẫn bàn giao](deploy/HANDOFF.md). Có `Check-FIN05.ps1` kiểm tra môi trường, `Setup-FIN05.ps1` khởi tạo cấu hình localhost khi API chưa chạy, `Export-FIN05.ps1` tạo gói nguồn không kèm bí mật/dữ liệu, và `deploy/FIN05-schema.sql` tạo cấu trúc từ migrations.

**Hóa đơn:** đăng nhập `ketoan01` hoặc `admin01`, chọn **Hóa đơn → Lập hóa đơn**. Xem [hướng dẫn hóa đơn nháp](deploy/INVOICES.md). `kinhdoanh01` không có quyền vào nghiệp vụ hóa đơn.

**Phát hành và công nợ:** mở chi tiết hóa đơn hợp lệ, chọn **Phát hành mô phỏng → Xác nhận phát hành**, sau đó mở **Công nợ**. Xem [quy tắc phát hành và công nợ](deploy/RECEIVABLES.md). Bản nháp không phát sinh công nợ; còn phải thu bằng giá trị hóa đơn + điều chỉnh đã ghi nhận còn hiệu lực − tiền đã phân bổ.

**Phiếu thu:** `thutien01` lập nháp và xác nhận khoản thu tại **Phiếu thu**. `ketoan01` mở phiếu đã xác nhận → **Phân bổ vào hóa đơn → Kiểm tra phân bổ → Xác nhận phân bổ**. Admin có cả hai quyền; quản lý chỉ xem. Xem [hướng dẫn phiếu thu và phân bổ](deploy/PAYMENTS.md).

**Nhắc nợ:** `ketoan01` hoặc `admin01` vào **Nhắc nợ**, chọn hóa đơn → **Lập nhắc nợ → Kiểm tra → Xác nhận tạo**. Sau khi liên hệ thực tế, ghi kết quả rồi đóng thông báo khi kết thúc đợt xử lý. Quản lý chỉ xem; chưa gửi email/SMS tự động. Xem [hướng dẫn nhắc nợ](deploy/REMINDERS.md).

**Điều chỉnh:** `ketoan01` hoặc `admin01` vào **Điều chỉnh → Chọn hóa đơn điều chỉnh → Lập điều chỉnh**. Nhập số tiền có dấu, lý do, các dòng Nợ/Có (có nút gợi ý hai dòng) → lưu nháp → **Ghi nhận điều chỉnh → Xác nhận ghi nhận**. Sửa sai chứng từ đã ghi nhận bằng **Đảo điều chỉnh**. Danh mục tài khoản là mô phỏng cho đồ án. Xem [hướng dẫn điều chỉnh và chứng từ](deploy/ADJUSTMENTS.md).

**Báo cáo:** `ketoan01`, `quanly01` hoặc `admin01` vào **Báo cáo**, chọn công nợ hiện tại/hóa đơn quá hạn/thu tiền, lọc khách hàng và khoảng ngày → **Xem báo cáo**. Có tổng cộng toàn bộ bộ lọc, tuổi nợ, phân trang và **Xuất CSV** tối đa 10.000 dòng. Khoảng ngày lọc theo hạn thanh toán hoặc ngày thu; chưa có số dư lịch sử tại ngày quá khứ. Xem [hướng dẫn báo cáo](deploy/REPORTS.md).

**Người dùng:** `admin01` vào **Người dùng** để tạo tài khoản mới hoặc tra cứu/liên kết tài khoản Keycloak đã có. Mở chi tiết → **Cập nhật hồ sơ và quyền → Kiểm tra thay đổi → Xác nhận lưu** để sửa hồ sơ, gán năm vai trò FIN-05, khóa/mở truy cập. Tài khoản mới có mật khẩu tạm, bắt buộc đổi ở lần đầu; tài khoản cũ không bị đặt lại mật khẩu. Có tác vụ để đối chiếu/thử lại khi đồng bộ chưa hoàn tất. Xem [hướng dẫn quản trị](deploy/USERS.md).

## Chạy trên máy hiện tại

Mở PowerShell trong thư mục FIN05:

```powershell
dotnet tool restore
dotnet restore backend/Fin05.Api
$env:ASPNETCORE_ENVIRONMENT = 'Development'
dotnet ef database update --project backend/Fin05.Api
dotnet run --project backend/Fin05.Api --launch-profile http
```

SQL Server: `localhost`, CSDL `FIN05`, Windows Authentication. Cấu hình phát triển trong `backend/Fin05.Api/appsettings.Development.json`; không chứa mật khẩu. Máy khác cần chỉnh kết nối tương ứng. Chứng chỉ SQL Server được tin cậy trong cấu hình phát triển này.

API chỉ chạy trong Development, mặc định lắng nghe `http://localhost:5068`. Keycloak phải chạy ở `http://localhost:8080`. API khách hàng cần Bearer token hợp lệ; mở trực tiếp `/api/customers` trên trình duyệt sẽ trả 401. Hãy dùng giao diện `http://localhost:5173` để đăng nhập và thao tác.

## Chạy giao diện

Giữ Backend chạy, mở terminal thứ hai tại FIN05:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Mở `http://localhost:5173` (hoặc địa chỉ Local Vite hiển thị). Bấm **Thêm khách hàng**, nhập mã và tên, rồi **Lưu khách hàng**. Dữ liệu được lưu thật vào FIN05.dbo.Customers. Có thể tìm theo mã hoặc tên, xem chi tiết và chuyển trang (10 khách hàng/trang).

Vite proxy chuyển `/api` đến `http://localhost:5068`. Nếu thấy lỗi cổng 5068 đã sử dụng, kiểm tra `http://localhost:5068/api/customers` trước khi chạy thêm Backend. Nếu API trả JSON thì Backend đã chạy.

## Các API đã có

| Phương thức | Đường dẫn | Kết quả |
|---|---|---|
| GET | `/api/customers?page=1&pageSize=20&search=KH001` | Danh sách, tìm kiếm theo mã hoặc tên, phân trang tối đa 100 bản ghi |
| GET | `/api/customers/{id}` | Chi tiết khách hàng; 404 nếu không có |
| POST | `/api/customers` | Thêm khách hàng; 201 thành công, 400 dữ liệu sai, 409 mã trùng |
| PUT | `/api/customers/{id}` | Sửa thông tin; cần rowVersion từ lần đọc gần nhất; 409 nếu mã trùng hoặc phiên bản cũ |
| PATCH | `/api/customers/{id}/status` | Body `{ "isActive": false, "rowVersion": "..." }`; đổi trạng thái, giữ nguyên hồ sơ |
| GET | `/api/customers/{id}/audit?page=1&pageSize=20` | Lịch sử thao tác, chỉ admin/sales được đọc |
| GET | `/api/me` | Định danh, vai trò và appUserId của người dùng đã xác thực |

GET danh sách hỗ trợ thêm `isActive=true` hoặc `isActive=false`; bỏ tham số để xem tất cả. Trong giao diện, mở **Chi tiết** để dùng **Sửa thông tin**, **Ngừng hoạt động** hoặc **Kích hoạt lại**. Ngừng hoạt động yêu cầu xác nhận, không xóa hồ sơ.

Migration CustomerConcurrency bổ sung `Customers.RowVersion` kiểu SQL Server ROWVERSION để chặn ghi đè khi có cập nhật đồng thời. Giá trị trả về JSON dạng base64 và phải gửi lại khi sửa/đổi trạng thái. Khi gặp 409 do phiên bản cũ, giữ nội dung đang nhập để người dùng đối chiếu; đóng cửa sổ, tải lại danh sách rồi mở hồ sơ mới nhất. CreatedAt vẫn giữ nguyên và trả về UTC. Đây là một bổ sung so với Bảng 4.2 ban đầu; khi chốt báo cáo cần bổ sung dòng RowVersion vào bảng mô tả Customers.

Mã khách hàng được cắt khoảng trắng hai đầu và chuyển thành chữ hoa. Mã và tên bắt buộc; giới hạn độ dài theo Bảng 4.2 của báo cáo. Khách hàng mới hoạt động mặc định; thời gian tạo lưu theo UTC. Chỉ mục duy nhất trong SQL Server bảo vệ mã khách hàng khi có yêu cầu đồng thời.

Các yêu cầu mẫu nằm trong `backend/Fin05.Api/Fin05.Api.http`.

Trong SSMS: Databases → FIN05 → Tables → Refresh → dbo.Customers.

## Người thực hiện và lịch sử thao tác

Migration AppUsersAndAuditLogs tạo hai bảng nghiệp vụ theo Chương 4. Trên mỗi yêu cầu API đã xác thực, hệ thống dùng sub từ JWT hợp lệ để tìm hoặc tạo AppUsers, đồng bộ tên/email và giữ nguyên IsActive. Migration UserAdministration bổ sung phiên bản, trạng thái đồng bộ và tác vụ quản trị. Claims cũ không ghi đè hồ sơ vừa được admin sửa; vai trò của tài khoản đã quản lý được giao với vai trò trong JWT để thu hồi ngay quyền cũ, không tự cấp quyền mới từ body. Khóa hoặc chờ đồng bộ bị chặn 403 kể cả token còn hạn. Không lưu mật khẩu/token trong CSDL nghiệp vụ; chi tiết trong deploy/USERS.md.

Mỗi lần thêm, sửa hoặc đổi trạng thái khách hàng thành công đều ghi AuditLogs với UserId, thời gian UTC, hành động và giá trị trước/sau. Thay đổi khách hàng và nhật ký nằm trong cùng một transaction: lỗi ghi nhật ký hoàn tác thay đổi khách hàng. Dữ liệu sai, mã trùng, phiên bản cũ hoặc cập nhật không thay đổi gì không tạo nhật ký thành công.

Mở **Chi tiết → Lịch sử thao tác** để xem ai đã sửa và các giá trị trước/sau. Chỉ admin/sales được đọc; API không cung cấp sửa/xóa nhật ký. Hồ sơ có từ trước khi bật nhật ký chỉ có lịch sử từ lần thao tác tiếp theo, không tạo dữ liệu lịch sử giả.

## Kiểm tra

Khi Backend đang chạy, mở PowerShell thứ hai tại FIN05:

```powershell
cd frontend
npm.cmd run test:e2e
```

Đã chạy đạt 15 kiểm tra với SQL Server thật: thêm/đọc, tiếng Việt, chuẩn hóa mã, tìm kiếm và phân trang, dữ liệu sai, mã trùng, hai yêu cầu đồng thời và xác minh bản ghi trực tiếp bằng SQL. Script dọn đúng các bản ghi có mã ngẫu nhiên do lượt kiểm thử tạo ra.

## Công việc tiếp theo

1. Đối chiếu lại báo cáo Word với bản triển khai thực tế và các giới hạn đã ghi trong deploy/.
2. Nếu cần triển khai ngoài máy phát triển, chuẩn bị và kiểm chứng Docker/HTTPS/CSDL Keycloak phù hợp riêng; gói bàn giao hiện là mã nguồn cho môi trường Windows cục bộ.

Frontend có 74 kịch bản trình duyệt/API: 17 xác thực/khách hàng/nhật ký, 6 hóa đơn nháp, 6 phát hành/công nợ, 8 phiếu thu/phân bổ, 8 nhắc nợ, 9 điều chỉnh/chứng từ, 8 báo cáo/CSV, 9 quản trị người dùng và 3 bàn làm việc. Chạy `npm.cmd run build`, `npm.cmd run lint` và `npm.cmd run test:e2e` để kiểm tra. Bộ 15 kiểm tra API được chạy trong suite bằng token thật. Chi tiết trong deploy/INVOICES.md, deploy/RECEIVABLES.md, deploy/PAYMENTS.md, deploy/REMINDERS.md, deploy/ADJUSTMENTS.md, deploy/REPORTS.md và deploy/USERS.md.

## Giao diện Sổ công nợ

Mở `/overview` hoặc chọn Bàn làm việc trong thanh điều hướng. Giao diện dùng nền giấy ngà, xanh rêu và đỏ gạch để nhấn số dư quá hạn; các bảng chứng từ, hộp thoại và trang đăng nhập dùng chung thiết kế. Chi tiết quyết định thiết kế và phạm vi số liệu trong deploy/INTERFACE.md.

Kiểm thử dùng tài khoản riêng có tiền tố fin05_test_, mật khẩu riêng trong `.local/test-accounts.json`; không đăng nhập hoặc đặt lại mật khẩu các tài khoản người dùng đang sử dụng. Bản ghi khách hàng/nhật ký kiểm thử được dọn theo mã riêng. Kiểm tra hoàn tác tạo một CHECK constraint tạm chỉ từ chối dữ liệu có mã ngẫu nhiên của ca thử, rồi gỡ trong finally.

Keycloak đã chạy bằng Java portable trong tools. Chưa cài Docker/WSL; xem deploy/KEYCLOAK.md để biết cách khởi động và các giới hạn của môi trường phát triển.

`npm audit --omit=dev` không có cảnh báo. Toàn bộ dependency tree hiện có 10 cảnh báo moderate trong công cụ lint (minimatch và các gói phụ thuộc); chưa tự ép hạ phiên bản ESLint theo đề nghị `--force` vì có thể phá cấu hình.

EF Core sử dụng provider chính thức: https://learn.microsoft.com/en-us/ef/core/providers/sql-server/
