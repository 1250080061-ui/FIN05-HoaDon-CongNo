namespace Fin05.Api.Models;

public sealed class DebtReminder
{
    public long ReminderId { get; set; }
    public long InvoiceId { get; set; }
    public Invoice Invoice { get; set; } = null!;
    public long CreatedByUserId { get; set; }
    public AppUser CreatedByUser { get; set; } = null!;
    public DateTime ReminderDate { get; set; }
    public DateOnly ScheduledDate { get; set; }
    public decimal BalanceAtCreation { get; set; }
    public string Content { get; set; } = "";
    public string ContactChannel { get; set; } = "Phone";
    public string ContactInfo { get; set; } = "";
    public string Status { get; set; } = "Open";
    public DateTime? ContactedAt { get; set; }
    public string? ContactNote { get; set; }
    public DateTime? ClosedAt { get; set; }
    public string? CloseReason { get; set; }
    public byte[] RowVersion { get; set; } = [];
}
