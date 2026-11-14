using Fin05.Api.Data;
using Fin05.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Fin05.Api.Services;

// All readers and financial writers share this formula. Draft/reversed adjustments have no net effect.
public static class ReceivableBalances
{
    public const decimal MaxMoney = 9999999999999999.99m;
    public static IQueryable<InvoiceBalance> Query(Fin05DbContext db) => db.Invoices.AsNoTracking()
        .Where(x => x.IssueStatus == "Issued")
        .Select(x => new InvoiceBalance {
            InvoiceId = x.InvoiceId, InvoiceNumber = x.InvoiceNumber!, CustomerId = x.CustomerId,
            CustomerCode = x.Customer.CustomerCode, CustomerName = x.Customer.CustomerName,
            Phone = x.Customer.Phone, Email = x.Customer.Email, DueDate = x.DueDate,
            RowVersion = x.RowVersion, TotalAmount = x.TotalAmount,
            AdjustmentAmount = db.DebtAdjustments.Where(a => a.InvoiceId == x.InvoiceId && a.Status == "Posted").Sum(a => (decimal?)a.SignedAmount) ?? 0m,
            PaidAmount = db.PaymentAllocations.Where(a => a.InvoiceId == x.InvoiceId).Sum(a => (decimal?)a.AllocatedAmount) ?? 0m
        }).Select(x => new InvoiceBalance {
            InvoiceId = x.InvoiceId, InvoiceNumber = x.InvoiceNumber, CustomerId = x.CustomerId,
            CustomerCode = x.CustomerCode, CustomerName = x.CustomerName, Phone = x.Phone, Email = x.Email,
            DueDate = x.DueDate, RowVersion = x.RowVersion, TotalAmount = x.TotalAmount,
            AdjustmentAmount = x.AdjustmentAmount, PaidAmount = x.PaidAmount,
            RemainingAmount = x.TotalAmount + x.AdjustmentAmount - x.PaidAmount
        });
    public static async Task<decimal> Remaining(Fin05DbContext db, Invoice invoice, CancellationToken ct) => invoice.TotalAmount
        + (await db.DebtAdjustments.Where(x => x.InvoiceId == invoice.InvoiceId && x.Status == "Posted").SumAsync(x => (decimal?)x.SignedAmount, ct) ?? 0m)
        - (await db.PaymentAllocations.Where(x => x.InvoiceId == invoice.InvoiceId).SumAsync(x => (decimal?)x.AllocatedAmount, ct) ?? 0m);
}
public sealed class InvoiceBalance
{
    public long InvoiceId { get; init; }
    public string InvoiceNumber { get; init; } = "";
    public long CustomerId { get; init; }
    public string CustomerCode { get; init; } = "";
    public string CustomerName { get; init; } = "";
    public string? Phone { get; init; }
    public string? Email { get; init; }
    public DateOnly DueDate { get; init; }
    public byte[] RowVersion { get; init; } = [];
    public decimal TotalAmount { get; init; }
    public decimal AdjustmentAmount { get; init; }
    public decimal PaidAmount { get; init; }
    public decimal RemainingAmount { get; init; }
}
