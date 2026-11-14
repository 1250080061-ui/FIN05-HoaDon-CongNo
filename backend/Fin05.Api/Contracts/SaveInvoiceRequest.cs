using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Fin05.Api.Contracts;

public class SaveInvoiceRequest
{
    [Range(1, long.MaxValue)] public long CustomerId { get; init; }
    [Required] public DateOnly? InvoiceDate { get; init; }
    [Required] public DateOnly? DueDate { get; init; }
    [Required, MaxLength(200)] public List<InvoiceLineRequest> Items { get; init; } = [];
}

public sealed class UpdateInvoiceRequest : SaveInvoiceRequest
{
    [Required, MinLength(8), MaxLength(8)] public byte[] RowVersion { get; init; } = [];
}

public sealed class InvoiceVersionRequest
{
    [Required, MinLength(8), MaxLength(8)] public byte[] RowVersion { get; init; } = [];
}

public sealed class InvoiceLineRequest
{
    [Required, StringLength(500)] public string Description { get; init; } = "";
    [Range(typeof(decimal), "0.001", "999999999.999")]
    [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
    public decimal Quantity { get; init; }
    [Range(typeof(decimal), "0", "999999999999.99")]
    [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
    public decimal UnitPrice { get; init; }
}
