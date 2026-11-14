using System.ComponentModel.DataAnnotations;

namespace Fin05.Api.Contracts;

public sealed class UpdateCustomerRequest : CreateCustomerRequest
{
    [Required, MinLength(8), MaxLength(8)]
    public byte[] RowVersion { get; init; } = [];
}

public sealed class ChangeCustomerStatusRequest
{
    [Required] public bool? IsActive { get; init; }
    [Required, MinLength(8), MaxLength(8)]
    public byte[] RowVersion { get; init; } = [];
}
