using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Text.Json;
using Fin05.Api.Contracts;
using Fin05.Api.Data;
using Fin05.Api.Models;
using Fin05.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;

namespace Fin05.Api.Controllers;

[ApiController, Route("api/users"), Authorize(Policy = "Users.Admin"), ServiceFilter(typeof(UserAdminWriteFilter))]
public sealed class UsersController(Fin05DbContext db, CurrentAppUser actor, BusinessClock clock, KeycloakUserAdmin keycloak) : ControllerBase
{
    private ObjectResult Stale() => Problem(statusCode: 409, title: "Tài khoản hoặc tác vụ đã thay đổi. Hãy tải lại trước khi xác nhận.");
    private ObjectResult Self() => Problem(statusCode: 400, title: "Không sửa quyền hoặc trạng thái tài khoản đang sử dụng tại đây. Dùng Tài khoản & mật khẩu cho thông tin cá nhân.");
    private static string[] RoleList(AppUser u) => JsonSerializer.Deserialize<string[]>(u.ManagedRolesJson ?? u.ObservedRolesJson ?? "[]") ?? [];
    private static object LocalView(AppUser u) => new { u.UserId, subject = u.KeycloakSubject, u.Username, u.FullName, u.Email,
        u.IsActive, u.AdminSyncPending, roles = RoleList(u), rolesManaged = u.ManagedRolesJson is not null,
        u.CreatedAt, u.LastAdminUpdate, u.RowVersion };
    private static object OperationView(UserAdminOperation o) => new { o.OperationId, o.TargetUserId, o.TargetSubject,
        o.TargetUsername, o.Kind, o.Status, o.StartedAt, o.CompletedAt, o.LastError, o.RowVersion,
        desired = JsonSerializer.Deserialize<UserProfileRequest>(o.DesiredJson) };
    private static object KcView(KeycloakPerson p, string[] roles, long? localId) => new { subject = p.Id, p.Username,
        firstName = p.FirstName ?? "", lastName = p.LastName ?? "", email = p.Email ?? "", p.Enabled, p.RequiredActions, roles, localUserId = localId };
    private static bool Human(KeycloakPerson p) => p.ServiceAccountClientId is null && !p.Username.StartsWith("service-account-", StringComparison.OrdinalIgnoreCase);

    [HttpGet]
    public async Task<IActionResult> List([FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, 100)] int pageSize = 20, [FromQuery, StringLength(150)] string? search = null,
        [FromQuery] string? role = null, [FromQuery] bool? isActive = null, CancellationToken ct = default)
    {
        if ((long)(page - 1) * pageSize > int.MaxValue || role is not null && !KeycloakUserAdmin.BusinessRoles.Contains(role))
            return Problem(statusCode: 400, title: "Trang hoặc vai trò không hợp lệ.");
        var q = db.AppUsers.AsNoTracking();
        if (isActive.HasValue) q = q.Where(x => x.IsActive == isActive);
        if (role is not null) { var needle = JsonSerializer.Serialize(role); q = q.Where(x => (x.ManagedRolesJson ?? x.ObservedRolesJson ?? "[]").Contains(needle)); }
        if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim(); q = q.Where(x => x.Username != null && x.Username.Contains(term) || x.FullName.Contains(term) || x.Email != null && x.Email.Contains(term)); }
        var total = await q.CountAsync(ct);
        var rows = await q.OrderBy(x => x.UserId).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return Ok(new { total, page, pageSize, items = rows.Select(LocalView), currentUserId = actor.UserId });
    }
    [HttpGet("operations")]
    public async Task<IActionResult> Operations(CancellationToken ct) => Ok((await db.UserAdminOperations.AsNoTracking()
        .Where(x => x.Status != "Completed").OrderByDescending(x => x.OperationId).Take(50).ToListAsync(ct)).Select(OperationView));

    [HttpGet("lookup")]
    public async Task<IActionResult> Lookup([FromQuery, Required, StringLength(150)] string username, CancellationToken ct)
    {
        try {
            var p = await keycloak.Find(username.Trim(), ct);
            if (p is null || !Human(p)) return Problem(statusCode: 404, title: "Không tìm thấy tài khoản người dùng có tên đăng nhập chính xác này.");
            var id = await db.AppUsers.AsNoTracking().Where(x => x.KeycloakSubject == p.Id).Select(x => (long?)x.UserId).SingleOrDefaultAsync(ct);
            return Ok(KcView(p, await keycloak.Roles(p.Id, ct), id));
        } catch (UserManagementException e) { return Problem(statusCode: e.StatusCode, title: e.Message); }
        catch (HttpRequestException) { return Unavailable(); } catch (TaskCanceledException) { return Unavailable(); }
    }
    [HttpGet("{id:long:min(1)}")]
    public async Task<IActionResult> Get(long id, CancellationToken ct)
    {
        var user = await db.AppUsers.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == id, ct);
        if (user is null) return NotFound();
        try {
            var person = await keycloak.Person(user.KeycloakSubject, ct);
            if (!Human(person)) return Problem(statusCode: 400, title: "Không quản lý tài khoản kỹ thuật.");
            var operations = await db.UserAdminOperations.AsNoTracking().Where(x => x.TargetSubject == user.KeycloakSubject)
                .OrderByDescending(x => x.OperationId).Take(30).Select(x => new { x.OperationId, x.Kind, x.Status, x.StartedAt,
                    x.CompletedAt, x.LastError, actorName = x.ActorUser.FullName, x.RowVersion }).ToListAsync(ct);
            return Ok(new { local = LocalView(user), keycloak = KcView(person, await keycloak.Roles(person.Id, ct), id), operations,
                isSelf = actor.UserId == id });
        } catch (UserManagementException e) { return Problem(statusCode: e.StatusCode, title: e.Message); }
        catch (HttpRequestException) { return Unavailable(); } catch (TaskCanceledException) { return Unavailable(); }
    }

    [HttpPost("link")]
    public async Task<IActionResult> Link(LinkManagedUserRequest request, CancellationToken ct)
    {
        if (!Guid.TryParse(request.Subject, out _)) return BadRequest();
        try {
            var p = await keycloak.Person(request.Subject, ct);
            if (!Human(p)) return Problem(statusCode: 400, title: "Không liên kết tài khoản kỹ thuật.");
            var roles = await keycloak.Roles(p.Id, ct);
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            if (!await LockActor(ct)) return Forbid();
            if (await db.AppUsers.AnyAsync(x => x.KeycloakSubject == p.Id, ct)) return Problem(statusCode: 409, title: "Tài khoản đã được liên kết. Hãy mở chi tiết từ danh sách.");
            var user = new AppUser { KeycloakSubject = p.Id, Username = p.Username, FullName = FullName(p.FirstName ?? "", p.LastName ?? "", p.Username),
                Email = p.Email, IsActive = p.Enabled, ManagedRolesJson = JsonSerializer.Serialize(roles), LastAdminUpdate = clock.UtcNow };
            db.AppUsers.Add(user); await db.SaveChangesAsync(ct);
            Audit("User.Link", user.UserId.ToString(CultureInfo.InvariantCulture), new { Subject = p.Id, p.Username, Roles = roles, p.Enabled });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return Ok(LocalView(user));
        } catch (UserManagementException e) { return Problem(statusCode: e.StatusCode, title: e.Message); }
        catch (DbUpdateException e) when (e.InnerException is SqlException { Number: 2601 or 2627 }) { return Problem(statusCode: 409, title: "Tài khoản vừa được liên kết ở yêu cầu khác. Hãy tải lại danh sách."); }
        catch (HttpRequestException) { return Unavailable(); } catch (TaskCanceledException) { return Unavailable(); }
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateManagedUserRequest request, CancellationToken ct)
    {
        if (!ValidateRoles(request)) return ValidationProblem(ModelState);
        UserAdminOperation operation;
        try {
            if (await keycloak.Find(request.Username.Trim(), ct) is not null) return Problem(statusCode: 409, title: "Tên đăng nhập đã tồn tại. Hãy tra cứu để liên kết, không tạo lại hoặc đổi mật khẩu tài khoản cũ.");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            if (!await LockActor(ct)) return Forbid();
            operation = NewOperation("Create", request.Username.Trim(), null, null, Normalize(request));
            db.UserAdminOperations.Add(operation); await db.SaveChangesAsync(ct);
            Audit("User.ChangeRequested", operation.OperationId.ToString(CultureInfo.InvariantCulture), new { operation.Kind, operation.TargetUsername, Desired = Normalize(request) });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        } catch (UserManagementException e) { return Problem(statusCode: e.StatusCode, title: e.Message); }
        catch (HttpRequestException) { return Unavailable(); } catch (TaskCanceledException) { return Unavailable(); }
        try {
            var p = await keycloak.Create(request, ct); // Always created disabled. Password is never persisted in business storage or audit.
            operation.TargetSubject = p.Id;
            var user = new AppUser { KeycloakSubject = p.Id, Username = p.Username, FullName = FullName(p.FirstName ?? "", p.LastName ?? "", p.Username), Email = p.Email,
                IsActive = false, AdminSyncPending = true, ManagedRolesJson = "[]" };
            db.AppUsers.Add(user); await db.SaveChangesAsync(ct);
            operation.TargetUserId = user.UserId; await db.SaveChangesAsync(ct);
            return await Execute(operation, ct);
        } catch (Exception e) when (e is UserManagementException or HttpRequestException or TaskCanceledException or DbUpdateException) {
            return await Fail(operation.OperationId, operation.TargetSubject, e);
        }
    }

    [HttpPut("{id:long:min(1)}")]
    public async Task<IActionResult> Update(long id, UpdateManagedUserRequest request, CancellationToken ct)
    {
        if (id == actor.UserId) return Self();
        if (!ValidateRoles(request)) return ValidationProblem(ModelState);
        UserAdminOperation operation;
        await using (var tx = await db.Database.BeginTransactionAsync(ct)) {
            if (!await LockActor(ct)) return Forbid();
            var user = await db.AppUsers.SingleOrDefaultAsync(x => x.UserId == id, ct);
            if (user is null) return NotFound();
            if (!user.RowVersion.AsSpan().SequenceEqual(request.RowVersion) || user.AdminSyncPending) return Stale();
            var desired = Normalize(request);
            var before = LocalView(user);
            operation = NewOperation("Update", user.Username ?? user.KeycloakSubject, user.KeycloakSubject, id, desired);
            db.UserAdminOperations.Add(operation); user.AdminSyncPending = true;
            if (!desired.Enabled) user.IsActive = false; // Revoke locally before any remote request.
            await db.SaveChangesAsync(ct);
            Audit("User.ChangeRequested", operation.OperationId.ToString(CultureInfo.InvariantCulture), new { Before = before, Desired = desired });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        }
        return await Execute(operation, ct);
    }

    [HttpPost("operations/{id:long:min(1)}/retry")]
    public async Task<IActionResult> Retry(long id, InvoiceVersionRequest request, CancellationToken ct)
    {
        UserAdminOperation operation;
        await using (var tx = await db.Database.BeginTransactionAsync(ct)) {
            if (!await LockActor(ct)) return Forbid();
            operation = (await db.UserAdminOperations.SingleOrDefaultAsync(x => x.OperationId == id, ct))!;
            if (operation is null) return NotFound();
            if (operation.TargetUserId == actor.UserId) return Self();
            if (operation.Status == "Completed" || !operation.RowVersion.AsSpan().SequenceEqual(request.RowVersion)) return Stale();
            if (operation.TargetSubject is not null && operation.TargetUserId is null)
                operation.TargetUserId = await db.AppUsers.Where(x => x.KeycloakSubject == operation.TargetSubject).Select(x => (long?)x.UserId).SingleOrDefaultAsync(ct);
            if (operation.TargetSubject is null || operation.TargetUserId is null)
                return Problem(statusCode: 409, title: "Chưa xác định được liên kết tài khoản của tác vụ. Hãy tra cứu tên đăng nhập và kiểm tra tài khoản trên Keycloak trước khi liên kết; không tự tạo lại hoặc đặt lại mật khẩu.");
            if (await db.UserAdminOperations.AnyAsync(x => x.TargetSubject == operation.TargetSubject && x.OperationId > id, ct)) return Stale();
            var user = await db.AppUsers.SingleAsync(x => x.UserId == operation.TargetUserId, ct);
            user.AdminSyncPending = true; operation.Status = "Pending"; operation.LastError = null;
            await db.SaveChangesAsync(ct); Audit("User.RetryRequested", id.ToString(CultureInfo.InvariantCulture), new { operation.TargetSubject });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        }
        return await Execute(operation, ct);
    }

    private async Task<IActionResult> Execute(UserAdminOperation operation, CancellationToken ct)
    {
        try {
            var desired = JsonSerializer.Deserialize<UserProfileRequest>(operation.DesiredJson)!;
            await keycloak.Apply(operation.TargetSubject!, desired, ct);
            var verified = await keycloak.Person(operation.TargetSubject!, ct);
            if (verified.Enabled != desired.Enabled || verified.FirstName != desired.FirstName || verified.LastName != desired.LastName || verified.Email != desired.Email)
                throw new UserManagementException(409, "Thông tin Keycloak thay đổi trong khi đồng bộ. Hãy đối chiếu và thử lại.");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var user = await db.AppUsers.SingleAsync(x => x.UserId == operation.TargetUserId, ct);
            user.FullName = FullName(desired.FirstName, desired.LastName, operation.TargetUsername); user.Email = desired.Email;
            user.Username = verified.Username;
            user.ManagedRolesJson = JsonSerializer.Serialize(desired.Roles); user.IsActive = desired.Enabled;
            user.AdminSyncPending = false; user.LastAdminUpdate = clock.UtcNow;
            operation.Status = "Completed"; operation.CompletedAt = clock.UtcNow; operation.LastError = null;
            await db.SaveChangesAsync(ct);
            Audit("User.ChangeCompleted", operation.OperationId.ToString(CultureInfo.InvariantCulture), new { operation.Kind, Target = LocalView(user), Desired = desired });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return Ok(new { user = LocalView(user), operation = OperationView(operation) });
        } catch (Exception e) when (e is UserManagementException or HttpRequestException or TaskCanceledException or DbUpdateException) {
            return await Fail(operation.OperationId, operation.TargetSubject, e);
        }
    }
    private async Task<IActionResult> Fail(long id, string? subject, Exception error)
    {
        // SQL and Keycloak cannot share a transaction. Persist the incomplete work; never report a remote rollback.
        db.ChangeTracker.Clear();
        var operation = await db.UserAdminOperations.SingleAsync(x => x.OperationId == id, CancellationToken.None);
        operation.TargetSubject ??= subject; operation.Status = "Failed";
        operation.LastError = error is UserManagementException e ? e.Message : "Chưa hoàn tất đồng bộ Keycloak và dữ liệu nội bộ. Tài khoản đích tiếp tục bị chặn để quản trị viên đối chiếu/thử lại.";
        Audit("User.ChangeIncomplete", id.ToString(CultureInfo.InvariantCulture), new { operation.TargetSubject, operation.LastError });
        await db.SaveChangesAsync(CancellationToken.None);
        return Problem(statusCode: 503, title: $"Tác vụ #{id} chưa hoàn tất. {operation.LastError}", extensions: new Dictionary<string,object?> { ["operationId"] = id });
    }
    private async Task<bool> LockActor(CancellationToken ct) {
        await db.Database.ExecuteSqlRawAsync("DECLARE @r int; EXEC @r=sp_getapplock @Resource=N'FIN05.UserAdministration',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; IF @r<0 THROW 50001,'User administration busy',1;", ct);
        var user = await db.AppUsers.SingleAsync(x => x.UserId == actor.UserId, ct);
        await db.Entry(user).ReloadAsync(ct);
        return user.IsActive && !user.AdminSyncPending && (user.ManagedRolesJson is null || RoleList(user).Contains("admin"));
    }
    private bool ValidateRoles(UserProfileRequest r) {
        if (r.Roles.Any(x => !KeycloakUserAdmin.BusinessRoles.Contains(x)) || r.Roles.Distinct().Count() != r.Roles.Length)
            ModelState.AddModelError("roles", "Chỉ chọn các vai trò nghiệp vụ FIN-05, mỗi vai trò một lần.");
        return ModelState.IsValid;
    }
    private static UserProfileRequest Normalize(UserProfileRequest r) => new() { FirstName = r.FirstName.Trim(), LastName = r.LastName.Trim(),
        Email = r.Email.Trim(), Enabled = r.Enabled, Roles = r.Roles.Order().ToArray() };
    private static string FullName(string first, string last, string fallback) => string.IsNullOrWhiteSpace(first + last) ? fallback : (first + " " + last).Trim();
    private UserAdminOperation NewOperation(string kind, string username, string? subject, long? id, UserProfileRequest desired) => new() {
        ActorUserId = actor.UserId, TargetUsername = username, TargetSubject = subject, TargetUserId = id,
        Kind = kind, StartedAt = clock.UtcNow, DesiredJson = JsonSerializer.Serialize(desired) };
    private void Audit(string action, string id, object value) => db.AuditLogs.Add(new AuditLog { UserId = actor.UserId,
        EntityName = "UserAdministration", EntityId = id, Action = action, ActionTime = clock.UtcNow, Description = JsonSerializer.Serialize(value) });
    private ObjectResult Unavailable() => Problem(statusCode: 503, title: "Chưa kết nối được quản trị Keycloak. Hãy tải lại danh sách và đối chiếu trạng thái tác vụ trước khi thử lại.");
}
