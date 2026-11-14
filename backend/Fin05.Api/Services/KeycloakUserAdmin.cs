using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Fin05.Api.Contracts;

namespace Fin05.Api.Services;

public sealed class UserManagementException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
public sealed class KeycloakPerson
{
    public string Id { get; set; } = "";
    public string Username { get; set; } = "";
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? Email { get; set; }
    public bool EmailVerified { get; set; }
    public bool Enabled { get; set; }
    public string? ServiceAccountClientId { get; set; }
    public string[] RequiredActions { get; set; } = [];
}
public sealed record KeycloakRole(string Id, string Name);
public sealed class KeycloakUserAdmin(HttpClient client, IConfiguration configuration, BusinessClock clock)
{
    public static readonly string[] BusinessRoles = ["admin", "sales", "accountant", "cashier", "manager"];
    private const string Base = "http://localhost:8080/admin/realms/fin05/";
    private string? token;
    private DateTime tokenExpires;
    private async Task<string> Token(CancellationToken ct) {
        if (token is not null && tokenExpires > clock.UtcNow) return token;
        var secret = configuration["KeycloakAdmin:ClientSecret"];
        if (string.IsNullOrWhiteSpace(secret)) throw new UserManagementException(503, "Chưa cấu hình kết nối quản trị Keycloak. Chạy Configure-UserAdministration.ps1 rồi khởi động lại API.");
        using var response = await client.PostAsync("http://localhost:8080/realms/fin05/protocol/openid-connect/token", new FormUrlEncodedContent(new Dictionary<string,string> {
            ["grant_type"] = "client_credentials", ["client_id"] = configuration["KeycloakAdmin:ClientId"] ?? "fin05-user-admin", ["client_secret"] = secret
        }), ct);
        if (!response.IsSuccessStatusCode) throw new UserManagementException(503, "Không xác thực được kết nối quản trị Keycloak.");
        var result = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        token = result.GetProperty("access_token").GetString()!;
        tokenExpires = clock.UtcNow.AddSeconds(Math.Max(1, result.GetProperty("expires_in").GetInt32() - 20));
        return token;
    }
    private async Task<HttpResponseMessage> Send(HttpMethod method, string path, object? body, CancellationToken ct) {
        using var request = new HttpRequestMessage(method, Base + path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await Token(ct));
        if (body is not null) request.Content = JsonContent.Create(body);
        var response = await client.SendAsync(request, ct);
        if (response.IsSuccessStatusCode) return response;
        var status = response.StatusCode; response.Dispose();
        throw new UserManagementException(status == HttpStatusCode.NotFound ? 404 : status == HttpStatusCode.Conflict ? 409 : status == HttpStatusCode.BadRequest ? 400 : 503,
            status == HttpStatusCode.NotFound ? "Không tìm thấy tài khoản hoặc vai trò trên Keycloak." : status == HttpStatusCode.Conflict ? "Tên đăng nhập hoặc email đã tồn tại trên Keycloak." : status == HttpStatusCode.BadRequest ? "Keycloak từ chối thông tin tài khoản. Hãy kiểm tra dữ liệu và chính sách mật khẩu." : "Kết nối quản trị Keycloak chưa sẵn sàng hoặc thiếu quyền.");
    }
    private async Task<T> Get<T>(string path, CancellationToken ct) { using var response = await Send(HttpMethod.Get, path, null, ct); return (await response.Content.ReadFromJsonAsync<T>(ct))!; }
    private async Task Write(HttpMethod method, string path, object body, CancellationToken ct) { using var response = await Send(method, path, body, ct); }
    public Task<KeycloakPerson> Person(string subject, CancellationToken ct) => Get<KeycloakPerson>($"users/{Uri.EscapeDataString(subject)}", ct);
    public async Task<KeycloakPerson?> Find(string username, CancellationToken ct) => (await Get<List<KeycloakPerson>>($"users?username={Uri.EscapeDataString(username)}&exact=true&max=2", ct)).SingleOrDefault();
    public async Task<string[]> Roles(string subject, CancellationToken ct) => (await Get<List<KeycloakRole>>($"users/{subject}/role-mappings/realm/composite", ct))
        .Select(x => x.Name).Where(BusinessRoles.Contains).Distinct().Order().ToArray();
    public async Task<KeycloakPerson> Create(CreateManagedUserRequest request, CancellationToken ct) {
        using var response = await Send(HttpMethod.Post, "users", new {
            username = request.Username.Trim(), firstName = request.FirstName.Trim(), lastName = request.LastName.Trim(), email = request.Email.Trim(), enabled = false,
            emailVerified = false, requiredActions = new[] { "UPDATE_PASSWORD" },
            credentials = new[] { new { type = "password", value = request.InitialPassword, temporary = true } }
        }, ct);
        var subject = response.Headers.Location?.ToString().TrimEnd('/').Split('/').Last();
        if (!Guid.TryParse(subject, out _)) throw new UserManagementException(503, "Keycloak chưa trả định danh tài khoản vừa tạo. Hãy tra cứu tên đăng nhập để đối chiếu trước khi tạo lại.");
        return await Person(subject, ct);
    }
    public async Task Apply(string subject, UserProfileRequest desired, CancellationToken ct) {
        var person = await Person(subject, ct);
        if (person.ServiceAccountClientId is not null || person.Username.StartsWith("service-account-", StringComparison.OrdinalIgnoreCase))
            throw new UserManagementException(400, "Không quản lý tài khoản kỹ thuật bằng màn hình người dùng.");
        await Write(HttpMethod.Put, $"users/{subject}", new { firstName = desired.FirstName.Trim(), lastName = desired.LastName.Trim(), email = desired.Email.Trim(),
            emailVerified = person.Email == desired.Email.Trim() && person.EmailVerified, enabled = person.Enabled }, ct);
        var direct = await Get<List<KeycloakRole>>($"users/{subject}/role-mappings/realm", ct);
        var remove = direct.Where(x => BusinessRoles.Contains(x.Name) && !desired.Roles.Contains(x.Name)).ToArray();
        if (remove.Length > 0) await Write(HttpMethod.Delete, $"users/{subject}/role-mappings/realm", remove, ct);
        var add = new List<KeycloakRole>();
        foreach (var role in desired.Roles.Where(x => direct.All(r => r.Name != x))) add.Add(await Get<KeycloakRole>($"roles/{role}", ct));
        if (add.Count > 0) await Write(HttpMethod.Post, $"users/{subject}/role-mappings/realm", add, ct);
        var effective = await Roles(subject, ct);
        if (!effective.SequenceEqual(desired.Roles.Order())) throw new UserManagementException(409, "Vai trò kế thừa từ nhóm hoặc cấu hình Keycloak chưa khớp yêu cầu. Hãy kiểm tra trên Keycloak trước khi đồng bộ lại.");
        var accountClients = await Get<List<JsonElement>>("clients?clientId=account", ct);
        var accountId = accountClients.Single().GetProperty("id").GetString();
        var accountRoles = new List<KeycloakRole>();
        foreach (var name in new[] { "manage-account", "view-profile" }) accountRoles.Add(await Get<KeycloakRole>($"clients/{accountId}/roles/{name}", ct));
        await Write(HttpMethod.Post, $"users/{subject}/role-mappings/clients/{accountId}", accountRoles, ct);
        // Preserve credentials, required actions, group and unrelated role mappings.
        await Write(HttpMethod.Put, $"users/{subject}", new { enabled = desired.Enabled }, ct);
        using var logout = await Send(HttpMethod.Post, $"users/{subject}/logout", null, ct);
    }
}
