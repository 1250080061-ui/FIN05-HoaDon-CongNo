using Fin05.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Fin05.Api.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile(Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "../../.local/keycloak-admin.json")), optional: true, reloadOnChange: false);
if (!builder.Environment.IsDevelopment())
    throw new InvalidOperationException("Bản hiện tại được cấu hình cho môi trường Development trên localhost.");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.Authority = builder.Configuration["Authentication:Authority"]
        ?? throw new InvalidOperationException("Thiếu Authentication:Authority.");
    options.Audience = "fin05-api";
    options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
    options.MapInboundClaims = false;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidateAudience = true, ValidateLifetime = true,
        ValidateIssuerSigningKey = true, NameClaimType = "preferred_username", RoleClaimType = "roles",
        ClockSkew = TimeSpan.FromSeconds(30)
    };
});
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Customers.Read", policy => policy.RequireAuthenticatedUser().RequireRole("admin", "sales", "accountant", "cashier", "manager"));
    options.AddPolicy("Customers.Write", policy => policy.RequireAuthenticatedUser().RequireRole("admin", "sales"));
    options.AddPolicy("Invoices.Read", policy => policy.RequireAuthenticatedUser().RequireRole("admin", "accountant", "manager"));
    options.AddPolicy("Invoices.Write", policy => policy.RequireAuthenticatedUser().RequireRole("admin", "accountant"));
    options.AddPolicy("Receivables.Read", policy => policy.RequireAuthenticatedUser().RequireRole("admin", "accountant", "manager"));
    options.AddPolicy("Payments.Read", policy => policy.RequireAuthenticatedUser().RequireRole("admin", "cashier", "accountant", "manager"));
    options.AddPolicy("Payments.Write", policy => policy.RequireAuthenticatedUser().RequireRole("admin", "cashier"));
    options.AddPolicy("Allocations.Write", policy => policy.RequireAuthenticatedUser().RequireRole("admin", "accountant"));
    options.AddPolicy("Reminders.Read", policy => policy.RequireAuthenticatedUser().RequireRole("admin", "accountant", "manager"));
    options.AddPolicy("Reminders.Write", policy => policy.RequireAuthenticatedUser().RequireRole("admin", "accountant"));
    options.AddPolicy("Adjustments.Read", policy => policy.RequireAuthenticatedUser().RequireRole("admin", "accountant", "manager"));
    options.AddPolicy("Adjustments.Write", policy => policy.RequireAuthenticatedUser().RequireRole("admin", "accountant"));
    options.AddPolicy("Reports.Read", policy => policy.RequireAuthenticatedUser().RequireRole("admin", "accountant", "manager"));
    options.AddPolicy("Users.Admin", policy => policy.RequireAuthenticatedUser().RequireRole("admin"));
});
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddScoped<CurrentAppUser>();
builder.Services.AddScoped<CustomerAuditService>();
builder.Services.AddHttpClient<KeycloakUserAdmin>(client => client.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddSingleton<UserAdminWriteFilter>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<BusinessClock>();
builder.Services.AddDbContext<Fin05DbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Fin05")
        ?? throw new InvalidOperationException("Thiếu cấu hình ConnectionStrings:Fin05.")));
var app = builder.Build();
app.UseExceptionHandler();
app.UseAuthentication();
app.UseMiddleware<AppUserMiddleware>();
app.UseAuthorization();
app.MapGet("/", () => Results.Ok(new { application = "FIN-05", stage = "API khách hàng với Keycloak OIDC", customers = "/api/customers" }));
app.MapGet("/api/me", (System.Security.Claims.ClaimsPrincipal user, CurrentAppUser current) => Results.Ok(new
{
    subject = user.FindFirst("sub")?.Value,
    username = user.Identity?.Name,
    name = user.FindFirst("name")?.Value,
    roles = user.FindAll("roles").Select(claim => claim.Value),
    appUserId = current.UserId,
    isActive = current.User!.IsActive
})).RequireAuthorization();
app.MapControllers();
app.Run();
