using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Text;
using Fin05.Api.Data;
using Fin05.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Fin05.Api.Controllers;

public sealed class ReportFilter
{
    [RegularExpression("^(Receivables|Overdue|Collections)$")] public string Type { get; init; } = "Receivables";
    [StringLength(200)] public string? Search { get; init; }
    [Range(1, long.MaxValue)] public long? CustomerId { get; init; }
    public DateOnly? FromDate { get; init; }
    public DateOnly? ToDate { get; init; }
    [Range(1, int.MaxValue)] public int Page { get; init; } = 1;
    [Range(1, 100)] public int PageSize { get; init; } = 20;
}

[ApiController, Route("api/reports"), Authorize(Policy = "Reports.Read")]
public sealed class ReportsController(Fin05DbContext db, BusinessClock clock) : ControllerBase
{
    private const int MaxExport = 10000;
    private static string Money(decimal v) => v.ToString("0.00", CultureInfo.InvariantCulture);
    [HttpGet]
    public Task<IActionResult> Get([FromQuery] ReportFilter filter, CancellationToken ct) => Build(filter, false, ct);
    [HttpGet("export")]
    public Task<IActionResult> Export([FromQuery] ReportFilter filter, CancellationToken ct) => Build(filter, true, ct);

    private async Task<IActionResult> Build(ReportFilter f, bool export, CancellationToken ct)
    {
        if ((long)(f.Page - 1) * f.PageSize > int.MaxValue || f.FromDate > f.ToDate)
            return Problem(statusCode: 400, title: "Số trang hoặc khoảng ngày không hợp lệ.");
        var generatedAt = clock.UtcNow; var today = clock.Today;
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var summary = new ReportSummary();
        List<ReportRow> rows;
        List<AgingBucket> aging = [];
        if (f.Type == "Collections") {
            var q = db.Payments.AsNoTracking().Where(x => x.Status == "Confirmed").Select(x => new {
                x.PaymentId, x.PaymentNumber, x.CustomerId, x.Customer.CustomerCode, x.Customer.CustomerName,
                x.PaymentDate, x.PaymentMethod, x.Amount,
                allocated = x.Allocations.Sum(a => (decimal?)a.AllocatedAmount) ?? 0m });
            if (f.CustomerId.HasValue) q = q.Where(x => x.CustomerId == f.CustomerId);
            if (f.FromDate.HasValue) q = q.Where(x => x.PaymentDate >= f.FromDate);
            if (f.ToDate.HasValue) q = q.Where(x => x.PaymentDate <= f.ToDate);
            if (!string.IsNullOrWhiteSpace(f.Search)) {
                var term = f.Search.Trim();
                q = q.Where(x => x.PaymentNumber.Contains(term) || x.CustomerCode.Contains(term) || x.CustomerName.Contains(term));
            }
            summary = await q.GroupBy(x => 1).Select(g => new ReportSummary {
                Count = g.Count(), Collected = g.Sum(x => x.Amount), Allocated = g.Sum(x => x.allocated),
                Unallocated = g.Sum(x => x.Amount - x.allocated)
            }).SingleOrDefaultAsync(ct) ?? summary;
            if (export && summary.Count > MaxExport) return TooLarge();
            var selected = q.OrderByDescending(x => x.PaymentDate).ThenByDescending(x => x.PaymentId);
            var page = export ? selected.Take(MaxExport) : selected.Skip((f.Page - 1) * f.PageSize).Take(f.PageSize);
            var result = await page.ToListAsync(ct);
            rows = result.Select(x => new ReportRow { Id = x.PaymentId, Number = x.PaymentNumber, CustomerId = x.CustomerId,
                CustomerCode = x.CustomerCode, CustomerName = x.CustomerName, Date = x.PaymentDate,
                Method = x.PaymentMethod, Collected = x.Amount, Allocated = x.allocated, Unallocated = x.Amount - x.allocated }).ToList();
        } else {
            var q = ReceivableBalances.Query(db);
            if (f.Type == "Overdue") q = q.Where(x => x.RemainingAmount > 0 && x.DueDate < today);
            if (f.CustomerId.HasValue) q = q.Where(x => x.CustomerId == f.CustomerId);
            if (f.FromDate.HasValue) q = q.Where(x => x.DueDate >= f.FromDate);
            if (f.ToDate.HasValue) q = q.Where(x => x.DueDate <= f.ToDate);
            if (!string.IsNullOrWhiteSpace(f.Search)) {
                var term = f.Search.Trim();
                q = q.Where(x => x.InvoiceNumber.Contains(term) || x.CustomerCode.Contains(term) || x.CustomerName.Contains(term));
            }
            summary = await q.GroupBy(x => 1).Select(g => new ReportSummary {
                Count = g.Count(), Original = g.Sum(x => x.TotalAmount), Adjustment = g.Sum(x => x.AdjustmentAmount),
                Allocated = g.Sum(x => x.PaidAmount), Remaining = g.Sum(x => x.RemainingAmount),
                Overdue = g.Sum(x => x.DueDate < today && x.RemainingAmount > 0 ? x.RemainingAmount : 0)
            }).SingleOrDefaultAsync(ct) ?? summary;
            if (export && summary.Count > MaxExport) return TooLarge();
            var d30 = today.AddDays(-30); var d60 = today.AddDays(-60); var d90 = today.AddDays(-90);
            var groups = await q.Where(x => x.RemainingAmount > 0).GroupBy(x => x.DueDate >= today ? 0 : x.DueDate >= d30 ? 1 : x.DueDate >= d60 ? 2 : x.DueDate >= d90 ? 3 : 4)
                .Select(g => new { bucket = g.Key, count = g.Count(), amount = g.Sum(x => x.RemainingAmount) }).ToListAsync(ct);
            aging = Enumerable.Range(0, 5).Select(i => new AgingBucket(i, groups.FirstOrDefault(g => g.bucket == i)?.count ?? 0,
                groups.FirstOrDefault(g => g.bucket == i)?.amount ?? 0m)).ToList();
            var selected = q.OrderBy(x => x.DueDate).ThenBy(x => x.InvoiceId);
            var page = export ? selected.Take(MaxExport) : selected.Skip((f.Page - 1) * f.PageSize).Take(f.PageSize);
            var result = await page.ToListAsync(ct);
            rows = result.Select(x => new ReportRow { Id = x.InvoiceId, Number = x.InvoiceNumber, CustomerId = x.CustomerId,
                CustomerCode = x.CustomerCode, CustomerName = x.CustomerName, Date = x.DueDate, Original = x.TotalAmount,
                Adjustment = x.AdjustmentAmount, Allocated = x.PaidAmount, Remaining = x.RemainingAmount,
                OverdueDays = x.RemainingAmount > 0 ? Math.Max(0, today.DayNumber - x.DueDate.DayNumber) : 0 }).ToList();
        }
        await transaction.CommitAsync(ct);
        if (export) return Csv(f, generatedAt, today, summary, rows, aging);
        return Ok(new { reportType = f.Type, generatedAt, asOfDate = today, basis = f.Type == "Collections" ? "PaymentDateCurrentAllocation" : "DueDateCurrentBalance",
            filters = new { search = f.Search?.Trim(), f.CustomerId, f.FromDate, f.ToDate }, total = summary.Count, page = f.Page, pageSize = f.PageSize,
            summary = new { originalAmount = Money(summary.Original), adjustmentAmount = Money(summary.Adjustment),
                allocatedAmount = Money(summary.Allocated), remainingAmount = Money(summary.Remaining), overdueAmount = Money(summary.Overdue),
                collectedAmount = Money(summary.Collected), unallocatedAmount = Money(summary.Unallocated), count = summary.Count },
            aging = aging.Select(x => new { bucket = x.Bucket, label = BucketLabel(x.Bucket), count = x.Count, amount = Money(x.Amount) }),
            items = rows.Select(x => new { id = x.Id, number = x.Number, customerId = x.CustomerId, customerCode = x.CustomerCode,
                customerName = x.CustomerName, date = x.Date, paymentMethod = x.Method, originalAmount = Money(x.Original),
                adjustmentAmount = Money(x.Adjustment), allocatedAmount = Money(x.Allocated), remainingAmount = Money(x.Remaining),
                collectedAmount = Money(x.Collected), unallocatedAmount = Money(x.Unallocated), overdueDays = x.OverdueDays }) });
    }

    private ObjectResult TooLarge() => Problem(statusCode: 400, title: $"Báo cáo có hơn {MaxExport} dòng. Hãy thu hẹp bộ lọc trước khi xuất CSV.");
    private static string BucketLabel(int i) => new[] { "Chưa quá hạn (gồm đến hạn hôm nay)", "Quá hạn 1–30 ngày", "Quá hạn 31–60 ngày", "Quá hạn 61–90 ngày", "Quá hạn trên 90 ngày" }[i];
    // Quote all cells; text that could be interpreted as a spreadsheet formula is prefixed with an apostrophe.
    private static string Cell(string value, bool text = true) {
        var trimmed = value.TrimStart();
        if (text && (value.StartsWith('\t') || value.StartsWith('\r') || value.StartsWith('\n') || trimmed.Length > 0 && "=+-@".Contains(trimmed[0]))) value = "'" + value;
        return "\"" + value.Replace("\"", "\"\"") + "\"";
    }
    private FileContentResult Csv(ReportFilter f, DateTime generated, DateOnly today, ReportSummary s, List<ReportRow> rows, List<AgingBucket> aging)
    {
        var csv = new StringBuilder();
        void Row(params string[] cells) => csv.AppendLine(string.Join(',', cells));
        Row(Cell("FIN-05"), Cell(f.Type == "Collections" ? "Thu tiền theo ngày thu" : f.Type == "Overdue" ? "Hóa đơn quá hạn hiện tại" : "Công nợ hiện tại"));
        Row(Cell("Lập lúc (UTC)"), Cell(generated.ToString("O")), Cell("Ngày nghiệp vụ"), Cell(today.ToString("yyyy-MM-dd")));
        Row(Cell("Lọc ngày theo"), Cell(f.Type == "Collections" ? "Ngày thu; phân bổ hiện tại của các phiếu trong kỳ" : "Hạn thanh toán; số dư hiện tại"));
        Row(Cell("Từ ngày"), Cell(f.FromDate?.ToString("yyyy-MM-dd") ?? "Tất cả"), Cell("Đến ngày"), Cell(f.ToDate?.ToString("yyyy-MM-dd") ?? "Tất cả"));
        Row(Cell("Từ khóa"), Cell(f.Search?.Trim() ?? ""), Cell("Mã định danh khách hàng"), Cell(f.CustomerId?.ToString(CultureInfo.InvariantCulture) ?? "Tất cả"));
        Row(Cell("Đơn vị"), Cell("VND; không phải số dư tại ngày quá khứ"));
        Row();
        if (f.Type == "Collections") {
            Row(new[] { "Số phiếu", "Mã khách hàng", "Tên khách hàng", "Ngày thu", "Phương thức", "Đã thu (VND)", "Đã phân bổ hiện tại (VND)", "Chưa phân bổ (VND)" }.Select(x => Cell(x)).ToArray());
            foreach (var x in rows) Row(Cell(x.Number), Cell(x.CustomerCode), Cell(x.CustomerName), Cell(x.Date.ToString("yyyy-MM-dd")), Cell(x.Method == "Cash" ? "Tiền mặt" : "Chuyển khoản"), Cell(Money(x.Collected), false), Cell(Money(x.Allocated), false), Cell(Money(x.Unallocated), false));
            Row(Cell("TỔNG"), Cell(""), Cell($"{s.Count} phiếu thu"), Cell(""), Cell(""), Cell(Money(s.Collected), false), Cell(Money(s.Allocated), false), Cell(Money(s.Unallocated), false));
        } else {
            Row(new[] { "Số hóa đơn", "Mã khách hàng", "Tên khách hàng", "Hạn thanh toán", "Giá trị gốc (VND)", "Điều chỉnh hiệu lực (VND)", "Đã phân bổ (VND)", "Còn phải thu (VND)", "Số ngày quá hạn" }.Select(x => Cell(x)).ToArray());
            foreach (var x in rows) Row(Cell(x.Number), Cell(x.CustomerCode), Cell(x.CustomerName), Cell(x.Date.ToString("yyyy-MM-dd")), Cell(Money(x.Original), false), Cell(Money(x.Adjustment), false), Cell(Money(x.Allocated), false), Cell(Money(x.Remaining), false), Cell(x.OverdueDays.ToString(CultureInfo.InvariantCulture), false));
            Row(Cell("TỔNG"), Cell(""), Cell($"{s.Count} hóa đơn"), Cell(""), Cell(Money(s.Original), false), Cell(Money(s.Adjustment), false), Cell(Money(s.Allocated), false), Cell(Money(s.Remaining), false), Cell(""));
            Row(); Row(Cell("Tuổi nợ"), Cell("Số hóa đơn còn dư"), Cell("Số dư (VND)"));
            foreach (var x in aging) Row(Cell(BucketLabel(x.Bucket)), Cell(x.Count.ToString(CultureInfo.InvariantCulture), false), Cell(Money(x.Amount), false));
        }
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray();
        return File(bytes, "text/csv; charset=utf-8", $"FIN05-{f.Type}-{generated:yyyyMMdd-HHmmss}.csv");
    }
    private sealed class ReportSummary { public int Count { get; init; } public decimal Original { get; init; } public decimal Adjustment { get; init; }
        public decimal Allocated { get; init; } public decimal Remaining { get; init; } public decimal Overdue { get; init; }
        public decimal Collected { get; init; } public decimal Unallocated { get; init; } }
    private sealed class ReportRow { public long Id { get; init; } public string Number { get; init; } = ""; public long CustomerId { get; init; }
        public string CustomerCode { get; init; } = ""; public string CustomerName { get; init; } = ""; public DateOnly Date { get; init; }
        public string? Method { get; init; } public decimal Original { get; init; } public decimal Adjustment { get; init; }
        public decimal Allocated { get; init; } public decimal Remaining { get; init; } public decimal Collected { get; init; }
        public decimal Unallocated { get; init; } public int OverdueDays { get; init; } }
    private sealed record AgingBucket(int Bucket, int Count, decimal Amount);
}
