using System.ComponentModel.DataAnnotations;

namespace Fin05.Api.Contracts;
public class UserProfileRequest
{
    [Required, StringLength(75)] public string FirstName { get; init; } = "";
    [Required, StringLength(74)] public string LastName { get; init; } = "";
    [Required, EmailAddress, StringLength(254)] public string Email { get; init; } = "";
    public bool Enabled { get; init; } = true;
    [Required, MinLength(1), MaxLength(5)] public string[] Roles { get; init; } = [];
}
public sealed class CreateManagedUserRequest : UserProfileRequest
{
    [Required, RegularExpression("^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$")] public string Username { get; init; } = "";
    [Required, StringLength(128, MinimumLength = 12)] public string InitialPassword { get; init; } = "";
}
public sealed class UpdateManagedUserRequest : UserProfileRequest
{
    [Required, MinLength(8), MaxLength(8)] public byte[] RowVersion { get; init; } = [];
}
public sealed class LinkManagedUserRequest
{
    [Required, StringLength(64)] public string Subject { get; init; } = "";
}
