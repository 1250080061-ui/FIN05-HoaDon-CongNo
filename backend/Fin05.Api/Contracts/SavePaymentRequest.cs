using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Fin05.Api.Contracts;

public class SavePaymentRequest
{
    [Range(1, long.MaxValue)] public long CustomerId { get; init; }
    [Required] public DateOnly? PaymentDate { get; init; }
    [Range(typeof(decimal), "0.01", "9999999999999999.99")]
    [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
    public decimal Amount { get; init; }
    [Required, RegularExpression("^(Cash|BankTransfer)$")] public string PaymentMethod { get; init; } = "";
    [StringLength(100)] public string? ReferenceNumber { get; init; }
}
public sealed class UpdatePaymentRequest : SavePaymentRequest
{
    [Required, MinLength(8), MaxLength(8)] public byte[] RowVersion { get; init; } = [];
}
public sealed class AllocatePaymentRequest
{
    [Required, MinLength(8), MaxLength(8)] public byte[] RowVersion { get; init; } = [];
    [Required, MinLength(1), MaxLength(100)] public List<AllocationLineRequest> Items { get; init; } = [];
}
public sealed class AllocationLineRequest
{
    [Range(1, long.MaxValue)] public long InvoiceId { get; init; }
    [Range(typeof(decimal), "0.01", "9999999999999999.99")]
    [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
    public decimal Amount { get; init; }
    [Required, MinLength(8), MaxLength(8)] public byte[] RowVersion { get; init; } = [];
}
