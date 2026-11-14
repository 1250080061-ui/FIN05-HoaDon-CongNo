namespace Fin05.Api.Models;

public sealed class Invoice
{
    public long InvoiceId { get; set; }
    public string? InvoiceNumber { get; set; }
    public long CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
    public long CreatedByUserId { get; set; }
    public AppUser CreatedByUser { get; set; } = null!;
    public DateTime InvoiceDate { get; set; }
    public DateOnly DueDate { get; set; }
    public decimal TotalAmount { get; set; }
    public string IssueStatus { get; set; } = "Draft";
    public DateTime? IssuedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public List<InvoiceItem> Items { get; set; } = [];
}

public sealed class InvoiceItem
{
    public long InvoiceItemId { get; set; }
    public long InvoiceId { get; set; }
    public Invoice Invoice { get; set; } = null!;
    public string Description { get; set; } = "";
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal LineAmount { get; set; }
}
