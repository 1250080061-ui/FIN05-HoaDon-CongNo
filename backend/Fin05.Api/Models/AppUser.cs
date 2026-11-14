namespace Fin05.Api.Models;

public sealed class AppUser
{
    public long UserId { get; set; }
    public string KeycloakSubject { get; set; } = "";
    public string FullName { get; set; } = "";
    public string? Email { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? Username { get; set; }
    public string? ManagedRolesJson { get; set; }
    public string? ObservedRolesJson { get; set; }
    public bool AdminSyncPending { get; set; }
    public DateTime? LastAdminUpdate { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

public sealed class UserAdminOperation
{
    public long OperationId { get; set; }
    public long ActorUserId { get; set; }
    public AppUser ActorUser { get; set; } = null!;
    public long? TargetUserId { get; set; }
    public AppUser? TargetUser { get; set; }
    public string? TargetSubject { get; set; }
    public string TargetUsername { get; set; } = "";
    public string Kind { get; set; } = "Update";
    public string Status { get; set; } = "Pending";
    public string DesiredJson { get; set; } = "";
    public string? LastError { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
}
