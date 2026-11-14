# Đăng nhập và phân quyền FIN05

## Dùng ngay trên máy hiện tại

1. Mở `http://localhost:5173`.
2. Bấm **Đăng nhập với Keycloak**.
3. Dùng `kinhdoanh01` để thử đầy đủ chức năng khách hàng. Mật khẩu trong `../.local/Tai-khoan-thu-nghiem.txt` hoặc `../.local/dev-accounts.json`.
4. Dùng **Tài khoản & mật khẩu** để mở Account Console của Keycloak; tại Account security → Signing in có thể đổi mật khẩu.
5. Bấm **Đăng xuất** để kết thúc phiên Keycloak và quay về trang đăng nhập.

| Tên đăng nhập | Vai trò | Quyền khách hàng hiện tại |
|---|---|---|
| admin01 | admin | Xem, thêm, sửa, đổi trạng thái |
| kinhdoanh01 | sales | Xem, thêm, sửa, đổi trạng thái |
| ketoan01 | accountant | Xem |
| thutien01 | cashier | Xem |
| quanly01 | manager | Xem |

`admin01` là quản trị viên nghiệp vụ FIN05, không phải quản trị viên máy chủ Keycloak. Màn hình UC13 đã có ở **Người dùng**; Backend dùng service account riêng để điều phối thao tác trong realm fin05. Bootstrap admin trong .local/dev-accounts.json chỉ dùng chuẩn bị môi trường, không dùng làm thông tin đăng nhập runtime của API. Xem [hướng dẫn UC13](USERS.md).

## Khởi động lần sau

Mở PowerShell 7 tại thư mục FIN05 và chạy:

```powershell
./Start-FIN05.ps1
```

Script dùng lại dịch vụ đang chạy đúng cổng, hoặc khởi động Keycloak, Backend và Vite ở nền. Log trong `.local/*.log`. Không mở thêm Backend nếu cổng 5068 đã chạy FIN05.

Nếu chép dự án sang máy khác, cài .NET 10 và Node trước, sau đó:

```powershell
./Install-Keycloak.ps1
dotnet tool restore
dotnet restore backend/Fin05.Api
$env:ASPNETCORE_ENVIRONMENT='Development'
dotnet ef database update --project backend/Fin05.Api
cd frontend
npm.cmd ci
cd ..
./Start-FIN05.ps1
```

Máy khác cũng cần SQL Server và chuỗi kết nối phù hợp. Keycloak dùng Java Temurin 25 và bản ZIP 26.8.2 trong `tools`, không cài Java toàn máy hoặc thay PATH vĩnh viễn. Các bản tải có checksum trong `runtime-versions.json`. Hiện chưa có Docker/WSL nên chưa chạy Docker Compose; đây là phương án phát triển cục bộ.

## Dữ liệu và cấu hình

- `deploy/fin05-realm.json`: cấu hình realm, vai trò và client; không có mật khẩu.
- `.local/dev-accounts.json`: mật khẩu phát triển sinh ngẫu nhiên, chỉ giữ trên máy; không đưa lên Git.
- `tools/keycloak-26.8.2/data`: dữ liệu danh tính Keycloak, giữ lại giữa các lần chạy. Không xóa để tránh mất tài khoản/phiên/cấu hình. Dữ liệu nghiệp vụ vẫn ở SQL Server FIN05.
- Lần khởi động đầu tiên nhập realm và các tài khoản. Khi realm đã tồn tại, Keycloak bỏ qua import; sửa file realm không tự thay đổi máy chủ đang dùng.
- Nếu tự đổi mật khẩu, file mật khẩu ban đầu không tự cập nhật. Hãy dùng mật khẩu mới khi đăng nhập. Kiểm thử tự động dùng tài khoản fin05_test_ riêng và `.local/test-accounts.json`, nên không cần biết hoặc thay đổi mật khẩu bạn đang dùng.
- Client React là public client `fin05-web`; sử dụng Authorization Code với PKCE S256. Không dùng client secret hoặc password grant. Token chỉ nằm trong bộ nhớ, không lưu localStorage/sessionStorage.
- API kiểm tra chữ ký, issuer, audience `fin05-api`, hạn token và vai trò trên từng yêu cầu. Thiếu/sai token trả 401; thiếu quyền trả 403. Cả nút giao diện và chính API đều kiểm tra quyền.
- Access token có hạn 5 phút, adapter tự làm mới. Đăng xuất kết thúc phiên và xóa token tại giao diện; access token đã cấp có thể còn hợp lệ đến khi hết hạn. Thao tác khóa/thu hồi vai trò qua UC13 được chặn ngay tại API bằng trạng thái AppUsers và giao với vai trò đã quản lý; không phải cơ chế thu hồi mọi JWT khi thay đổi trực tiếp ngoài ứng dụng.
- Dịch vụ chỉ phục vụ phát triển trên localhost: React 5173, API 5068, Keycloak 8080. Keycloak dùng H2 lưu file để thử nghiệm; cần CSDL và HTTPS phù hợp trước khi triển khai thật. Backend hiện chặn môi trường ngoài Development.
- Đã đồng bộ AppUsers và ghi nhật ký theo người thực hiện. UC13 quản lý hồ sơ, vai trò nghiệp vụ và khóa/mở truy cập. Tài khoản ngừng hoạt động/chờ đồng bộ bị chặn kể cả JWT còn hạn. Secret service account nằm ở .local/keycloak-admin.json, không trong React hoặc CSDL nghiệp vụ; không đưa lên Git.

## Kiểm tra

Nếu các tài khoản nhập từ bản cấu hình cũ mở Account Console báo “Something went wrong” và Account REST trả 401, chạy `./Fix-KeycloakAccountAccess.ps1` tại FIN05 một lần. Script chỉ bổ sung hai client role `account/manage-account` và `account/view-profile` cho 5 tài khoản thử nghiệm; không đổi mật khẩu hoặc vai trò nghiệp vụ. Sau đó đăng xuất và đăng nhập lại. Cấu hình nhập tài khoản mới trong Start-Keycloak.ps1 đã bao gồm các quyền này.

Khi cả ba dịch vụ chạy:

```powershell
cd frontend
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run lint
```

17 kịch bản chạy trên Edge headless: xác thực, phân quyền đủ 5 vai trò, các luồng khách hàng, nhật ký và đồng bộ người dùng. Có kiểm tra hoàn tác khi ghi nhật ký lỗi và bộ 15 kiểm tra API bằng token thật. Bản ghi kiểm thử được dọn theo mã riêng; không xóa dữ liệu người dùng. Global setup dùng bootstrap admin tạo các tài khoản kiểm thử riêng, không đặt lại mật khẩu người dùng thật.

## Tài liệu kỹ thuật

- https://www.keycloak.org/getting-started/getting-started-zip
- https://www.keycloak.org/securing-apps/javascript-adapter
- https://adoptium.net/installation/archives
