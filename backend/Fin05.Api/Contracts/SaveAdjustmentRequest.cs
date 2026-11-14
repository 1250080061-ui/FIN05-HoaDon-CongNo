using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Fin05.Api.Contracts;

public class SaveAdjustmentRequest
{
    [Range(1, long.MaxValue)] public long InvoiceId { get; init; }
    [Required, MinLength(8), MaxLength(8)] public byte[] InvoiceRowVersion { get; init; } = [];
    [Required] public DateOnly? AdjustmentDate { get; init; }
    [Range(typeof(decimal), "-9999999999999999.99", "9999999999999999.99")]
    [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)] public decimal SignedAmount { get; init; }
    [Required, StringLength(500)] public string Reason { get; init; } = "";
    [Required, MinLength(2), MaxLength(30)] public List<AdjustmentLineRequest> Lines { get; init; } = [];
}
public sealed class UpdateAdjustmentRequest : SaveAdjustmentRequest
{
    [Required, MinLength(8), MaxLength(8)] public byte[] RowVersion { get; init; } = [];
}
public class AdjustmentVersionRequest
{
    [Required, MinLength(8), MaxLength(8)] public byte[] RowVersion { get; init; } = [];
    [Required, MinLength(8), MaxLength(8)] public byte[] InvoiceRowVersion { get; init; } = [];
}
public sealed class ReverseAdjustmentRequest : AdjustmentVersionRequest
{
    [Required, StringLength(500)] public string Note { get; init; } = "";
}
public sealed class AdjustmentLineRequest
{
    [Range(1, long.MaxValue)] public long AccountId { get; init; }
    [Range(typeof(decimal), "0", "9999999999999999.99")]
    [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)] public decimal DebitAmount { get; init; }
    [Range(typeof(decimal), "0", "9999999999999999.99")]
    [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)] public decimal CreditAmount { get; init; }
}
