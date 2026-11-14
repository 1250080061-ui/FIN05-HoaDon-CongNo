using Fin05.Api.Data;
using Fin05.Api.Models;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Fin05.Api.Services;

public sealed class AppUserMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, Fin05DbContext db, CurrentAppUser currentUser)
    {
        if (context.Request.Path.StartsWithSegments("/api") && context.User.Identity?.IsAuthenticated == true)
        {
            var subject = context.User.FindFirst("sub")?.Value;
            if (string.IsNullOrWhiteSpace(subject) || subject.Length > 64)
            {
                await Results.Problem(statusCode: 401, title: "Định danh đăng nhập không hợp lệ.").ExecuteAsync(context);
                return;
            }
            // Only claims from the already-validated JWT identify the actor. Never read a user id from the request body.
            var name = Bound(context.User.FindFirst("name")?.Value, 150)
                ?? Bound(context.User.Identity.Name, 150) ?? subject;
            var email = Bound(context.User.FindFirst("email")?.Value, 254);
            var username = Bound(context.User.Identity.Name, 150);
            var observedClaims = JsonSerializer.Serialize(context.User.FindAll("roles").Select(c => c.Value).Where(KeycloakUserAdmin.BusinessRoles.Contains).Distinct().Order().ToArray());
            var user = await db.AppUsers.SingleOrDefaultAsync(x => x.KeycloakSubject == subject, context.RequestAborted);
            if (user is null)
            {
                user = new AppUser { KeycloakSubject = subject, FullName = name, Email = email, Username = username, ObservedRolesJson = observedClaims };
                db.AppUsers.Add(user);
                try { await db.SaveChangesAsync(context.RequestAborted); }
                catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 })
                {
                    // Simultaneous first requests may both attempt registration. Use the one winning the unique index.
                    db.Entry(user).State = EntityState.Detached;
                    user = await db.AppUsers.SingleAsync(x => x.KeycloakSubject == subject, context.RequestAborted);
                }
            }
            // Metadata updates also use RowVersion. A concurrent admin action wins; reload and recheck access instead of overwriting it.
            for (var attempt = 0; attempt < 3; attempt++)
            {
                if (!user.IsActive || user.AdminSyncPending) break;
                var observed = user.ManagedRolesJson is null ? observedClaims : user.ObservedRolesJson;
                var newerClaims = user.LastAdminUpdate is null || long.TryParse(context.User.FindFirst("iat")?.Value, out var issued)
                    && issued > new DateTimeOffset(user.LastAdminUpdate.Value).ToUnixTimeSeconds();
                if (user.Username == username && user.ObservedRolesJson == observed && (!newerClaims || user.FullName == name && user.Email == email)) break;
                user.Username = username; user.ObservedRolesJson = observed;
                if (newerClaims) { user.FullName = name; user.Email = email; }
                try { await db.SaveChangesAsync(context.RequestAborted); break; }
                catch (DbUpdateConcurrencyException) { await db.Entry(user).ReloadAsync(context.RequestAborted); }
            }
            if (!user.IsActive || user.AdminSyncPending)
            {
                await Results.Problem(statusCode: 403, title: user.AdminSyncPending ? "Tài khoản đang chờ hoàn tất đồng bộ quản trị. Vui lòng liên hệ quản trị viên." : "Tài khoản nội bộ đã ngừng hoạt động. Vui lòng liên hệ quản trị viên.").ExecuteAsync(context);
                return;
            }
            var allowedRoles = user.ManagedRolesJson is null ? null : JsonSerializer.Deserialize<string[]>(user.ManagedRolesJson) ?? [];
            if (allowedRoles is not null)
                foreach (var identity in context.User.Identities)
                    foreach (var claim in identity.FindAll("roles").Where(c => !allowedRoles.Contains(c.Value)).ToArray()) identity.RemoveClaim(claim);
            currentUser.User = user;
        }
        await next(context);
    }

    private static string? Bound(string? value, int length)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        value = value.Trim();
        if (value.Length <= length) return value;
        if (char.IsHighSurrogate(value[length - 1])) length--;
        return value[..length];
    }
}
