using Fin05.Api.Models;

namespace Fin05.Api.Services;

public sealed class CurrentAppUser
{
    public AppUser? User { get; set; }
    public long UserId => User?.UserId ?? throw new InvalidOperationException("Chưa xác định người thực hiện.");
}
