# Quản lý người dùng (UC13)

## Sử dụng

Đăng nhập `admin01`, mở **Người dùng** (http://localhost:5173/users). Chức năng dành riêng cho admin; các vai trò khác không có nút và API trả 403.

### Tạo tài khoản mới

1. Chọn **Tạo tài khoản mới**. Nhập tên đăng nhập 3–64 ký tự (chữ/số/dấu chấm/gạch dưới/gạch ngang), họ tên, email, mật khẩu tạm ít nhất 12 ký tự và một hoặc nhiều vai trò nghiệp vụ.
2. Chọn cho phép hoặc khóa truy cập, **Kiểm tra thay đổi**, đối chiếu hồ sơ/quyền → **Xác nhận lưu người dùng**.
3. Tài khoản được tạo trên Keycloak ở trạng thái tắt trước, sau đó gán vai trò và liên kết AppUsers. Chỉ mở truy cập sau khi hoàn tất đồng bộ. Ở lần đăng nhập đầu, Keycloak yêu cầu người dùng đổi mật khẩu tạm.
4. Mật khẩu chỉ đi qua yêu cầu tạo tài khoản đến Keycloak; không lưu trong AppUsers, UserAdminOperations, nhật ký hoặc trả về phản hồi. Cung cấp mật khẩu tạm cho đúng người dùng bên ngoài ứng dụng; FIN05 không tự gửi email/tin nhắn.

### Liên kết tài khoản đã có

Mở **Tra cứu và liên kết tài khoản Keycloak đã có**, nhập tên đăng nhập chính xác, bấm **Tra cứu Keycloak**. Kiểm tra hồ sơ/trạng thái/vai trò, rồi **Liên kết tài khoản này → Xác nhận liên kết**. Nếu đã liên kết, có nút mở chi tiết. Liên kết dùng KeycloakSubject, giữ nguyên mật khẩu/vai trò/trạng thái Keycloak; không ghép tài khoản chỉ vì trùng email hoặc tên.

Danh sách chỉ gồm tài khoản đã từng gọi API hoặc được admin liên kết, không phải toàn bộ danh mục realm. Các hồ sơ có từ trước migration mới có thể chưa có username/vai trò quan sát; lần đăng nhập tiếp theo sẽ cập nhật. Không quản lý service-account hoặc tài khoản kỹ thuật tại đây.

### Cập nhật hồ sơ, quyền và truy cập

1. Tìm/lọc username, họ tên, email, vai trò hoặc trạng thái; mở **Chi tiết** để đọc trạng thái Keycloak hiện tại và lịch sử quản trị.
2. **Cập nhật hồ sơ và quyền** cho phép sửa họ tên/email, chọn admin/sales/accountant/cashier/manager và cho phép/khóa truy cập.
3. **Kiểm tra thay đổi → Xác nhận lưu**. Gán admin có nhắc rõ quyền quản trị FIN-05. Thao tác không cấp quyền quản trị máy chủ Keycloak, không đặt lại mật khẩu hoặc sửa quyền ngoài danh sách vai trò nghiệp vụ.
4. Backend kết thúc phiên Keycloak của tài khoản đích. Người dùng đăng nhập lại để lấy quyền mới. Vai trò bị thu hồi được chặn ngay tại API kể cả khi token cũ còn hạn; quyền mới không được tự thêm vào token cũ.
5. Không tự sửa quyền/trạng thái của tài khoản admin đang dùng; dùng **Tài khoản & mật khẩu** cho hồ sơ cá nhân/đổi mật khẩu. Hai quản trị viên đồng thời thu hồi nhau được tuần tự hóa và kiểm tra lại người thực hiện, tránh cùng mất quyền qua luồng ứng dụng.

Vai trò trong danh sách là quyền đã đồng bộ hoặc quan sát từ JWT lần đăng nhập. Mở chi tiết để đối chiếu trạng thái Keycloak hiện tại. Khóa nội bộ không bị tự mở khi người dùng đăng nhập lại.

## Đồng bộ không hoàn tất

SQL Server và Keycloak không có chung transaction. Hệ thống không tuyên bố đã hoàn tác thay đổi Keycloak khi một thao tác SQL sau đó thất bại.

- Trước thay đổi từ xa, lưu yêu cầu đã xác nhận và nhật ký User.ChangeRequested trong SQL. Với tài khoản đã liên kết, đặt AdminSyncPending=true; yêu cầu khóa còn đặt IsActive=false ngay. Lỗi nhật ký giai đoạn chuẩn bị rollback SQL và chưa gọi thay đổi Keycloak.
- Áp dụng hồ sơ, vai trò, trạng thái và logout bằng Admin REST API; đối chiếu lại dữ liệu. Sau đó transaction SQL hoàn tất AppUsers, UserAdminOperations và User.ChangeCompleted. Hồ sơ, vai trò và trạng thái chỉ được coi đã hoàn tất khi transaction này thành công.
- Lỗi từ xa/lưu cuối để tác vụ Failed và giữ tài khoản đích bị chặn; có User.ChangeIncomplete. Nếu API bị dừng đột ngột, tác vụ có thể còn Pending; không tự bỏ chặn ở lần chạy sau.
- Mục **Tác vụ chưa hoàn tất** hiển thị tối đa 50 tác vụ mới nhất. **Kiểm tra thử lại** cho xem hồ sơ/vai trò/trạng thái đã yêu cầu trước **Xác nhận đồng bộ lại**. Thử lại áp dụng cùng yêu cầu, không tạo lại tài khoản hoặc đổi mật khẩu. Tác vụ cũ có yêu cầu mới hơn bị chặn 409.
- Nếu tạo tài khoản mất phản hồi trước khi biết định danh/liên kết, không tự tạo lại hoặc xóa tài khoản từ xa. Tra cứu username để đối chiếu; tài khoản mới được tạo tắt trước nên chưa mở quyền. Nếu đã có tài khoản đúng trên Keycloak nhưng chưa có AppUsers, liên kết thủ công rồi cập nhật quyền/trạng thái đã kiểm tra. Tác vụ chưa đủ định danh không cho thử lại tự động.
- Nếu tài khoản đã bị xóa trực tiếp trên Keycloak, không tự gắn danh tính mới cùng username vào lịch sử cũ. Tài khoản nội bộ tiếp tục bị chặn; cần quản trị viên đối chiếu danh tính/cấu hình Keycloak. Ứng dụng chưa có công cụ tự sửa mọi lỗi danh tính từ bên ngoài.

Backend đang phục vụ một tiến trình Development trên localhost. UserAdminWriteFilter tuần tự hóa toàn bộ luồng thay đổi (gồm gọi từ xa); sp_getapplock bảo vệ bước kiểm tra/chuẩn bị SQL và RowVersion chặn ghi đè. Đây không phải cơ chế hàng đợi phân tán cho nhiều replica sản xuất.

## Xác thực và lưu trữ

- AppUsers bổ sung Username, ManagedRolesJson, ObservedRolesJson, AdminSyncPending, LastAdminUpdate và RowVersion. JWT vẫn phải hợp lệ về chữ ký/issuer/audience/hạn trước mọi xử lý.
- Với tài khoản đã quản lý, vai trò thực thi tại API là giao giữa vai trò trong JWT đã xác thực và ManagedRolesJson. Không cấp quyền từ một giá trị do client tự khai báo. Quyền mới cần token mới; token cũ không giữ lại vai trò đã bị admin thu hồi.
- Hồ sơ từ JWT được đồng bộ khi claims mới hơn lần quản trị; token cũ không ghi đè hồ sơ vừa được admin sửa. Không tự mở IsActive khi đăng nhập. AdminSyncPending chặn tất cả API nghiệp vụ, kể cả /api/me.
- UserAdminOperations lưu người thực hiện, mục tiêu, dữ liệu hồ sơ/quyền đã yêu cầu (không có mật khẩu), trạng thái/thời điểm/lỗi và RowVersion. AuditLogs gắn người thực hiện đã xác thực; không lấy actor từ body.
- Không có API xóa AppUsers/Keycloak user hoặc đặt lại mật khẩu người dùng cũ. Lịch sử hóa đơn, phiếu thu, điều chỉnh và các khóa ngoại người thực hiện giữ nguyên.
- Vai trò kế thừa từ nhóm/composite được đọc để đối chiếu. Nếu sau gán trực tiếp vai trò hiệu lực không khớp yêu cầu, tác vụ báo chưa hoàn tất; không tự sửa nhóm hoặc cấu hình ngoài phạm vi.
- Các thay đổi trực tiếp bên ngoài ứng dụng vẫn tuân vòng đời JWT hiện có; đây không phải introspection/thu hồi tức thời mọi token khi admin sửa riêng trên Keycloak. Khóa/thu hồi qua UC13 có chặn tại SQL/API như trên.

## Cấu hình môi trường

Máy hiện tại đã được cấu hình service account `fin05-user-admin`. Secret chỉ trong `.local/keycloak-admin.json` (gitignored), được Backend nạp lúc khởi động từ đường dẫn ngoài frontend. Không sử dụng mật khẩu bootstrap admin trong các yêu cầu runtime.

Khi dựng lại realm trên máy phát triển, khởi động Keycloak rồi chạy:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Configure-UserAdministration.ps1
```

Khởi động lại API để nạp secret. Script dùng bootstrap admin riêng để cấu hình một lần; không reset mật khẩu các tài khoản đang dùng, không bật password grant ở client React, không tắt kiểm tra audience.

Service account chỉ có các quyền realm-management cần thiết cho quản lý người dùng/đọc vai trò và client trong realm fin05: query-users, view-users, manage-users, view-clients, view-realm (một số có quyền đọc composite kèm theo). Không gán realm-admin, manage-realm hoặc manage-clients cho runtime. API chỉ cho phép năm vai trò nghiệp vụ.

Keycloak 26.8.2 yêu cầu client scope kc-admin-api và audience tương ứng khi gọi Admin API; Configure-UserAdministration.ps1 gán scope này cho client riêng, theo [hướng dẫn nâng cấp chính thức](https://github.com/keycloak/keycloak/blob/26.8.2/docs/documentation/upgrading/topics/changes/changes-26_8_2.adoc). Các endpoint user/role mapping/logout dùng [Keycloak Admin REST API](https://www.keycloak.org/docs-api/latest/rest-api/index.html).

## API và kiểm tra

- `GET /api/users?search=&role=&isActive=&page=1&pageSize=20` (tối đa 100/trang).
- `GET /api/users/{id}`: local, keycloak và 30 tác vụ gần nhất; `GET /api/users/lookup?username=` tra cứu chính xác.
- `POST /api/users/link`: subject UUID đã kiểm tra từ tra cứu.
- `POST /api/users`: username, firstName, lastName, email, enabled, roles, initialPassword (chỉ khi tạo mới).
- `PUT /api/users/{id}`: firstName, lastName, email, enabled, roles, rowVersion; không đổi subject/username hoặc mật khẩu.
- `GET /api/users/operations`: các tác vụ chưa hoàn tất; `POST /api/users/operations/{id}/retry`: rowVersion của tác vụ.

9 kịch bản `frontend/tests/users.spec.ts`: tạo và đổi mật khẩu tạm, liên kết/không trùng/giữ mật khẩu, thu hồi token cũ/khóa-mở/hồ sơ, tự khóa/vai trò sai/ghi đồng thời, lỗi nhật ký trước/sau Keycloak và thử lại qua giao diện, quyền các vai trò, tài khoản mất trên Keycloak, hai admin thu hồi nhau và giao diện máy tính/điện thoại. Tài khoản thử có tên ua_<timestamp>_<suffix>, dọn đúng username/subject/operation đã tạo. Không reset mật khẩu tài khoản người dùng hoặc tài khoản kiểm thử lâu dài.
