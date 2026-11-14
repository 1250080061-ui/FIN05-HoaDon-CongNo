namespace Fin05.Api.Services;

public sealed class BusinessClock(TimeProvider time, IConfiguration configuration)
{
    private readonly TimeZoneInfo zone = TimeZoneInfo.FindSystemTimeZoneById(configuration["BusinessTimeZone"] ?? "Asia/Ho_Chi_Minh");
    public DateTime UtcNow => time.GetUtcNow().UtcDateTime;
    public DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(time.GetUtcNow(), zone).DateTime);
}
