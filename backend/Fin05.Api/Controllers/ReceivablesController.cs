using System.ComponentModel.DataAnnotations;
using System.Globalization;
using Fin05.Api.Data;
using Fin05.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Fin05.Api.Controllers;

[ApiController, Route("api/receivables"), Authorize(Policy = "Receivables.Read")]
public sealed class ReceivablesController(Fin05DbContext db, BusinessClock clock) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, 100)] int pageSize = 20,
        [FromQuery, StringLength(200)] string? search = null,
        [FromQuery, Range(1, long.MaxValue)] long? customerId = null,
        [FromQuery] bool? overdue = null,
        [FromQuery] DateOnly? fromDueDate = null,
        [FromQuery] DateOnly? toDueDate = null, CancellationToken cancellationToken = default)
    {
        if ((long)(page - 1) * pageSize > int.MaxValue) return Problem(statusCode: 400, title: "Số trang vượt phạm vi hỗ trợ.");
        if (fromDueDate > toDueDate) return Problem(statusCode: 400, title: "Khoảng hạn thanh toán không hợp lệ.");
        var today = clock.Today;
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
        var query = ReceivableBalances.Query(db).Select(x => new { x.InvoiceId, x.InvoiceNumber, x.CustomerId,
            customerCode = x.CustomerCode, customerName = x.CustomerName, x.DueDate, x.TotalAmount,
            adjustment = x.AdjustmentAmount, paid = x.PaidAmount, remaining = x.RemainingAmount });
        if (customerId.HasValue) query = query.Where(x => x.CustomerId == customerId);
        if (overdue.HasValue) query = overdue.Value ? query.Where(x => x.DueDate < today && x.remaining > 0) : query.Where(x => x.DueDate >= today || x.remaining <= 0);
        if (fromDueDate.HasValue) query = query.Where(x => x.DueDate >= fromDueDate);
        if (toDueDate.HasValue) query = query.Where(x => x.DueDate <= toDueDate);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.InvoiceNumber!.Contains(term) || x.customerName.Contains(term) || x.customerCode.Contains(term));
        }
        var count = await query.CountAsync(cancellationToken);
        var amount = await query.SumAsync(x => (decimal?)x.remaining, cancellationToken) ?? 0m;
        var overdueAmount = await query.Where(x => x.DueDate < today && x.remaining > 0).SumAsync(x => (decimal?)x.remaining, cancellationToken) ?? 0m;
        var rows = await query.OrderBy(x => x.DueDate).ThenBy(x => x.InvoiceId)
            .Skip((page - 1) * pageSize).Take(pageSize).Select(x => new {
                x.InvoiceId, x.InvoiceNumber, x.CustomerId, x.customerCode,
                x.customerName, x.DueDate, x.TotalAmount, x.adjustment, x.paid, x.remaining
            }).ToListAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Ok(new { asOfDate = today, items = rows.Select(x => new {
            x.InvoiceId, x.InvoiceNumber, x.CustomerId, x.customerCode, x.customerName, x.DueDate,
            originalAmount = Money(x.TotalAmount), adjustmentAmount = Money(x.adjustment), paidAmount = Money(x.paid),
            remainingAmount = Money(x.remaining), isOverdue = x.remaining > 0 && x.DueDate < today,
            paymentStatus = x.remaining <= 0 ? (x.paid > 0 ? "Paid" : "Settled") : x.paid > 0 ? "PartiallyPaid" : "Unpaid",
            overdueDays = x.remaining > 0 ? Math.Max(0, today.DayNumber - x.DueDate.DayNumber) : 0
        }), total = count, page, pageSize,
            summary = new { remainingAmount = Money(amount), overdueAmount = Money(overdueAmount), invoiceCount = count },
            stage = "PaymentsAndAdjustments" });
    }
    private static string Money(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
}
