namespace Fin05.Api.Models;

public sealed class Payment
{
    public long PaymentId { get; set; }
    public string PaymentNumber { get; set; } = "";
    public long CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
    public long ReceivedByUserId { get; set; }
    public AppUser ReceivedByUser { get; set; } = null!;
    public DateOnly PaymentDate { get; set; }
    public decimal Amount { get; set; }
    public string PaymentMethod { get; set; } = "Cash";
    public string? ReferenceNumber { get; set; }
    public string Status { get; set; } = "Draft";
    public DateTime? ConfirmedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public List<PaymentAllocation> Allocations { get; set; } = [];
}

public sealed class PaymentAllocation
{
    public long AllocationId { get; set; }
    public long PaymentId { get; set; }
    public Payment Payment { get; set; } = null!;
    public long InvoiceId { get; set; }
    public Invoice Invoice { get; set; } = null!;
    public decimal AllocatedAmount { get; set; }
    public DateTime AllocationDate { get; set; }
    public long CreatedByUserId { get; set; }
    public AppUser CreatedByUser { get; set; } = null!;
}
