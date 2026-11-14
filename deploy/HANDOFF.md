# Bàn giao FIN-05

Đề tài: Hệ thống quản lý hóa đơn và công nợ phải thu. Thực hiện cá nhân: Phạm Bùi Tiên Hoàng.

## Gói mã nguồn

Gói ZIP tạo bởi Export-FIN05.ps1 gồm backend C#/EF Core/migrations, frontend React + TypeScript và package-lock.json, kiểm thử, cấu hình realm không chứa tài khoản, các script hỗ trợ, hướng dẫn và SQL cấu trúc idempotent. HANDOFF-MANIFEST.json ghi danh sách tệp, kích thước và SHA256; tệp .zip.sha256 bên cạnh dùng đối chiếu toàn gói.

Không có .local, mật khẩu/secret/token, dữ liệu SQL/Keycloak, node_modules, bin/obj/dist, ảnh/kết quả kiểm thử, backup template, Java/Keycloak ZIP hoặc thư mục tools. Báo cáo Word và các sơ đồ draw.io bàn giao riêng; gói này không tự sửa hoặc thay thế chúng. Máy nhận cần tải dependencies và runtime bằng kết nối Internet.

Xuất lại tại thư mục FIN05:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Export-FIN05.ps1
```

Kết quả mặc định ở thư mục handoff cạnh FIN05. Mỗi lần xuất tạo tên mới, không ghi đè gói cũ. Script chỉ đóng gói nhóm tệp nguồn cho phép, kiểm tra SQL khớp các migrations và đối chiếu giá trị secret cục bộ trước khi tạo gói; thông báo lỗi không in secret. Có thể chỉ định -OutputDirectory với thư mục ngoài FIN05.

## Chạy lại trên máy đang làm

Mở Terminal tại FIN05:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-FIN05.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Check-FIN05.ps1
```

Mở http://localhost:5173. Start dùng lại dịch vụ FIN05 đúng cổng, không tạo thêm API trùng cổng. Check đọc môi trường, migrations, ba dịch vụ và kết nối quản trị UC13; không in mật khẩu hoặc token. FAIL trả mã thoát 1; WARN cần xem lại mục được ghi, ví dụ tác vụ quản trị chưa hoàn tất.

PowerShell 7 được tìm trong PATH, vị trí cài chuẩn hoặc runtime Codex nếu máy có sẵn. Máy khác không có PowerShell 7 phải cài trước. Không cần Codex để chạy dự án khi đã cài PowerShell 7 độc lập.

## Dựng trên máy Windows mới

Chuẩn bị trước:

- PowerShell 7, .NET SDK 10 và ASP.NET Core runtime 10.
- Node.js đáp ứng engines của Vite đã khóa: ^20.19.0 hoặc >=22.12.0. Máy phát triển đã chạy với Node 26.13.1; package-lock.json quyết định phiên bản thư viện.
- SQL Server có dịch vụ Database Engine, tài khoản Windows có quyền tạo/nâng cấp CSDL FIN05; sqlcmd trong PATH. SSMS là công cụ quản trị, không thay thế dịch vụ SQL Server.
- Internet để NuGet/npm tải thư viện và Install-Keycloak.ps1 tải các runtime được ghim trong deploy/runtime-versions.json.

1. Giải nén ZIP vào thư mục làm việc; vào thư mục FIN05 bên trong. Không giải nén đè lên thư mục .local/tools hoặc dự án đang dùng của máy khác.
2. Mặc định kết nối SQL Server localhost, CSDL FIN05, Windows Authentication. Nếu dùng instance khác, sửa backend/Fin05.Api/appsettings.Development.json và thực hiện các lệnh cài đặt tương ứng thủ công; Setup-FIN05.ps1 dành cho cấu hình localhost mặc định.
3. Khi API chưa chạy, thực hiện:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Setup-FIN05.ps1
```

Setup kiểm tra công cụ và SQL Server, restore dotnet-ef/NuGet, áp dụng EF migrations, npm ci, cài Java/Keycloak portable, chờ realm sẵn sàng, cấu hình service account UC13 rồi khởi động API/giao diện. Không tự cài SQL Server/.NET/Node/PowerShell, không tự dừng dịch vụ đang chiếm cổng 5068. Setup sẽ dừng tại bước lỗi; chưa phải trình cài đặt có khả năng rollback toàn bộ môi trường.

4. Chạy Check-FIN05.ps1. Mở giao diện; các tài khoản ban đầu và mật khẩu ngẫu nhiên mới của máy nhận nằm trong .local/Tai-khoan-thu-nghiem.txt. File này chỉ chứa mật khẩu khởi tạo; nếu đã đổi, dùng mật khẩu hiện tại.
5. Không mang mật khẩu phát triển của máy gửi vào gói nguồn. Nếu cần bảo toàn tài khoản và dữ liệu cũ, thực hiện quy trình sao lưu riêng bên dưới thay vì dùng lần khởi tạo sạch.

Setup đã được kiểm tra cú pháp và các lệnh thành phần trên máy phát triển; chưa kiểm chứng toàn bộ trên một Windows mới hoàn toàn. Không chạy Setup chỉ để mở lại ứng dụng hiện có; dùng Start để tránh build/migration khi API đang giữ tệp.

## SQL cấu trúc

deploy/FIN05-schema.sql được sinh bằng:

```powershell
dotnet ef migrations script --idempotent --project backend/Fin05.Api --no-build --output deploy/FIN05-schema.sql
```

Ưu tiên dotnet ef database update như Setup. Nếu dùng SQL thủ công, tạo/chọn đúng CSDL FIN05 rỗng, mở script trong SSMS và chạy tại CSDL đó. Script không tự chọn hoặc tạo CSDL; không chạy vào master. Không áp dụng SQL và migrations vào một CSDL có cấu trúc khác rồi coi như đã chuyển đổi dữ liệu.

Script có các kiểm tra lịch sử migration, có thể chạy lại khi các migrations đó đã được áp dụng. Chỉ kèm dữ liệu cấu hình ba tài khoản kế toán mô phỏng AR/ADJ/OTHER; không có khách hàng, tài khoản AppUsers, hóa đơn hoặc mật khẩu từ máy phát triển. Khi thêm migration mới phải build và sinh lại SQL trước khi đóng gói.

## Tài khoản và trình tự demo

| Tài khoản | Chức năng chính |
|---|---|
| kinhdoanh01 | Quản lý khách hàng |
| ketoan01 | Hóa đơn, phát hành mô phỏng, phân bổ, công nợ, nhắc nợ, điều chỉnh, báo cáo |
| thutien01 | Lập/sửa nháp và xác nhận phiếu thu |
| quanly01 | Xem hóa đơn, phiếu thu, công nợ, nhắc nợ, điều chỉnh và báo cáo |
| admin01 | Các nghiệp vụ trên và quản trị người dùng |

Demo một luồng ngắn: tạo khách → lập/phát hành hóa đơn → lập/xác nhận phiếu thu → phân bổ một phần → xem số dư → lập nhắc nợ → ghi điều chỉnh kèm Nợ/Có → xem báo cáo/CSV. Dùng ngày đến hạn phù hợp để hiện trong danh sách nhắc nợ. Thử quyền quản lý chỉ xem bằng quanly01. Tạo người dùng mới trong UC13, kiểm tra đổi mật khẩu tạm và khóa/mở bằng một tài khoản demo riêng; không tự khóa tài khoản admin đang dùng.

## Dữ liệu và sao lưu riêng

Gói nguồn không phải bản sao lưu dữ liệu. Hai kho cần bảo toàn cùng nhau:

- SQL Server FIN05: khách hàng/chứng từ, AppUsers, nhật ký và tác vụ. Dùng BACKUP DATABASE bằng SQL Server/SSMS đến vị trí SQL Server có quyền ghi, rồi kiểm tra bản sao lưu theo quy trình quản trị của bạn.
- Keycloak: tools/keycloak-26.8.2/data, bao gồm định danh subject và thông tin danh tính. Với bản H2 portable hiện tại, dừng đúng tiến trình Keycloak trước khi sao chép dữ liệu; không coi việc copy thư mục đang ghi là bản sao lưu nhất quán.

Giữ riêng .local/dev-accounts.json, .local/keycloak-admin.json nếu cần khôi phục môi trường tương ứng; đây là thông tin bí mật, không nộp công khai. Khi khôi phục phải giữ đúng cặp dữ liệu SQL/Keycloak: tái tạo username cùng tên không khôi phục subject cũ và không tự nối lại lịch sử. Hướng dẫn này không tự sao lưu, phục hồi hoặc ghi đè dữ liệu đang dùng.

## Kiểm tra và giới hạn

74 kịch bản ứng dụng đã đạt trên máy phát triển (71 ca nghiệp vụ và 3 ca bàn làm việc), gồm kiểm thử SQL Server/Keycloak thật và giao diện Edge. Giao diện Sổ công nợ mở tại /overview; xem INTERFACE.md. Chạy lại khi cả ba dịch vụ đã sẵn sàng:

```powershell
cd frontend
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run lint
```

Kiểm thử dùng tài khoản riêng và dọn đúng bản ghi do lượt thử tạo ra. SQL cấu trúc và gói nguồn có các kiểm tra bàn giao riêng; không cộng những kiểm tra đó thành chức năng nghiệp vụ mới.

Hiện là Development trên localhost: Keycloak H2 portable, API 5068, React/Vite 5173, Keycloak 8080; chưa có Docker Compose được chạy kiểm chứng, HTTPS hoặc quy trình triển khai sản xuất. Phát hành hóa đơn chỉ mô phỏng; thu tiền ghi nhận thủ công; nhắc nợ chưa tự gửi; danh mục kế toán là mô phỏng; báo cáo dùng số dư hiện tại, CSV tối đa 10.000 dòng. Không tuyên bố các tích hợp thuế/ngân hàng hoặc số dư quá khứ đã có.
