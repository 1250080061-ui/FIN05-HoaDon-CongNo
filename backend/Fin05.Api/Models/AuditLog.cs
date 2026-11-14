namespace Fin05.Api.Models;

public sealed class AuditLog
{
    public long AuditLogId { get; set; }
    public long? UserId { get; set; }
    public AppUser? User { get; set; }
    public string Action { get; set; } = "";
    public string EntityName { get; set; } = "";
    public string? EntityId { get; set; }
    public DateTime ActionTime { get; set; } = DateTime.UtcNow;
    public string? Description { get; set; }
}
