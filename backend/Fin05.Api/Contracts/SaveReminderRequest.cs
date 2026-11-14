using System.ComponentModel.DataAnnotations;

namespace Fin05.Api.Contracts;

public sealed class SaveReminderRequest
{
    [Range(1, long.MaxValue)] public long InvoiceId { get; init; }
    [Required, MinLength(8), MaxLength(8)] public byte[] InvoiceRowVersion { get; init; } = [];
    [Required] public DateOnly? ScheduledDate { get; init; }
    [Required, StringLength(4000)] public string Content { get; init; } = "";
    [Required, RegularExpression("^(Phone|Email|Other)$")] public string ContactChannel { get; init; } = "";
    [Required, StringLength(254)] public string ContactInfo { get; init; } = "";
}
public sealed class ReminderActionRequest
{
    [Required, MinLength(8), MaxLength(8)] public byte[] RowVersion { get; init; } = [];
    [Required, StringLength(1000)] public string Note { get; init; } = "";
}
