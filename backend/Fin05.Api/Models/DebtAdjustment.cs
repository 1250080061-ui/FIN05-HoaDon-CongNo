namespace Fin05.Api.Models;

public sealed class AccountingAccount
{
    public long AccountId { get; set; }
    public string AccountCode { get; set; } = "";
    public string AccountName { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public bool IsReceivable { get; set; }
}
public sealed class DebtAdjustment
{
    public long AdjustmentId { get; set; }
    public long InvoiceId { get; set; }
    public Invoice Invoice { get; set; } = null!;
    public long CreatedByUserId { get; set; }
    public AppUser CreatedByUser { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
    public DateOnly AdjustmentDate { get; set; }
    public decimal SignedAmount { get; set; }
    public string Reason { get; set; } = "";
    public string Status { get; set; } = "Draft";
    public DateTime? PostedAt { get; set; }
    public DateTime? ReversedAt { get; set; }
    public string? ReversalReason { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public List<DebtAdjustmentLine> Lines { get; set; } = [];
    public List<JournalEntry> JournalEntries { get; set; } = [];
}
public sealed class DebtAdjustmentLine
{
    public long DebtAdjustmentLineId { get; set; }
    public long AdjustmentId { get; set; }
    public DebtAdjustment Adjustment { get; set; } = null!;
    public long AccountId { get; set; }
    public AccountingAccount Account { get; set; } = null!;
    public decimal DebitAmount { get; set; }
    public decimal CreditAmount { get; set; }
}
public sealed class JournalEntry
{
    public long JournalEntryId { get; set; }
    public long AdjustmentId { get; set; }
    public DebtAdjustment Adjustment { get; set; } = null!;
    public DateOnly EntryDate { get; set; }
    public DateTime PostedAt { get; set; }
    public string EntryType { get; set; } = "Original";
    public string Description { get; set; } = "";
    public long PostedByUserId { get; set; }
    public AppUser PostedByUser { get; set; } = null!;
    public List<JournalEntryLine> Lines { get; set; } = [];
}
public sealed class JournalEntryLine
{
    public long JournalEntryLineId { get; set; }
    public long JournalEntryId { get; set; }
    public JournalEntry JournalEntry { get; set; } = null!;
    public long AccountId { get; set; }
    public AccountingAccount Account { get; set; } = null!;
    public decimal DebitAmount { get; set; }
    public decimal CreditAmount { get; set; }
}
