using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Text.Json;
using Fin05.Api.Contracts;
using Fin05.Api.Data;
using Fin05.Api.Models;
using Fin05.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Fin05.Api.Controllers;

[ApiController, Route("api/adjustments"), Authorize(Policy = "Adjustments.Read")]
public sealed class AdjustmentsController(Fin05DbContext db, CurrentAppUser actor, BusinessClock clock) : ControllerBase
{
    private static string Money(decimal v) => v.ToString("0.00", CultureInfo.InvariantCulture);
    private ObjectResult Missing() => Problem(statusCode: 404, title: "Không tìm thấy điều chỉnh công nợ.");
    private ObjectResult Stale() => Problem(statusCode: 409, title: "Điều chỉnh hoặc công nợ đã thay đổi. Hãy đóng và mở lại chi tiết để đối chiếu.");
    private ObjectResult InvalidBalance() => Problem(statusCode: 400, title: "Thao tác làm số dư âm hoặc vượt phạm vi tiền hỗ trợ. Hãy kiểm tra các khoản đã phân bổ và điều chỉnh còn hiệu lực.");

    [HttpGet("accounts")]
    public async Task<IActionResult> Accounts(CancellationToken ct) => Ok(await db.AccountingAccounts.AsNoTracking()
        .Where(x => x.IsActive).OrderBy(x => x.AccountId).Select(x => new { x.AccountId, x.AccountCode, x.AccountName, x.IsReceivable }).ToListAsync(ct));

    [HttpGet("invoices")]
    public async Task<IActionResult> Invoices([FromQuery, StringLength(200)] string? search = null,
        [FromQuery, Range(1, int.MaxValue)] int page = 1, [FromQuery, Range(1, 100)] int pageSize = 20, CancellationToken ct = default)
    {
        if ((long)(page - 1) * pageSize > int.MaxValue) return Problem(statusCode: 400, title: "Số trang không hợp lệ.");
        var query = ReceivableBalances.Query(db);
        if (!string.IsNullOrWhiteSpace(search)) {
            var term = search.Trim();
            query = query.Where(x => x.InvoiceNumber.Contains(term) || x.CustomerCode.Contains(term) || x.CustomerName.Contains(term));
        }
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.InvoiceId).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return Ok(new { total, page, pageSize, asOfDate = clock.Today, items = rows.Select(x => new { x.InvoiceId,
            x.InvoiceNumber, x.CustomerCode, x.CustomerName, x.DueDate, invoiceRowVersion = x.RowVersion,
            originalAmount = Money(x.TotalAmount), adjustmentAmount = Money(x.AdjustmentAmount), paidAmount = Money(x.PaidAmount), remainingAmount = Money(x.RemainingAmount) }) });
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery, StringLength(200)] string? search = null, [FromQuery] string? status = null,
        [FromQuery, Range(1, long.MaxValue)] long? invoiceId = null, [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, 100)] int pageSize = 20, CancellationToken ct = default)
    {
        if ((long)(page - 1) * pageSize > int.MaxValue || status is not null && status is not ("Draft" or "Posted" or "Reversed"))
            return Problem(statusCode: 400, title: "Trang hoặc trạng thái điều chỉnh không hợp lệ.");
        var query = db.DebtAdjustments.AsNoTracking();
        if (status is not null) query = query.Where(x => x.Status == status);
        if (invoiceId.HasValue) query = query.Where(x => x.InvoiceId == invoiceId);
        if (!string.IsNullOrWhiteSpace(search)) {
            var term = search.Trim(); var id = long.TryParse(term, out var parsed) ? parsed : -1;
            query = query.Where(x => x.AdjustmentId == id || x.Invoice.InvoiceNumber!.Contains(term)
                || x.Invoice.Customer.CustomerCode.Contains(term) || x.Invoice.Customer.CustomerName.Contains(term));
        }
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.AdjustmentId).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { x.AdjustmentId, x.InvoiceId, x.Invoice.InvoiceNumber, x.Invoice.Customer.CustomerCode,
                x.Invoice.Customer.CustomerName, x.AdjustmentDate, x.SignedAmount, x.Status, x.Reason }).ToListAsync(ct);
        return Ok(new { total, page, pageSize, items = rows.Select(x => new { x.AdjustmentId, x.InvoiceId,
            x.InvoiceNumber, x.CustomerCode, x.CustomerName, x.AdjustmentDate, signedAmount = Money(x.SignedAmount), x.Status, x.Reason }) });
    }

    [HttpGet("{id:long:min(1)}")]
    public async Task<IActionResult> Get(long id, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var adjustment = await Load(db.DebtAdjustments.AsNoTracking()).SingleOrDefaultAsync(x => x.AdjustmentId == id, ct);
        if (adjustment is null) return Missing();
        var remaining = await ReceivableBalances.Remaining(db, adjustment.Invoice, ct);
        var entityId = id.ToString(CultureInfo.InvariantCulture);
        var history = await db.AuditLogs.AsNoTracking().Where(x => x.EntityName == "DebtAdjustments" && x.EntityId == entityId)
            .OrderBy(x => x.AuditLogId).Select(x => new { x.Action, x.ActionTime, actorName = x.User != null ? x.User.FullName : "Hệ thống" }).ToListAsync(ct);
        var detail = View(adjustment, remaining);
        await transaction.CommitAsync(ct);
        return Ok(new { detail, history });
    }

    [HttpPost, Authorize(Policy = "Adjustments.Write")]
    public async Task<IActionResult> Create(SaveAdjustmentRequest request, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var invoice = await LockInvoice(request.InvoiceId, ct);
        if (invoice is null || invoice.IssueStatus != "Issued") return Problem(statusCode: 400, title: "Chỉ điều chỉnh hóa đơn đã phát hành.");
        if (!invoice.RowVersion.AsSpan().SequenceEqual(request.InvoiceRowVersion)) return Stale();
        var lines = await Validate(request, ct);
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var remaining = await ReceivableBalances.Remaining(db, invoice, ct);
        if (!ValidBalance(remaining + request.SignedAmount)) return InvalidBalance();
        var adjustment = new DebtAdjustment { Invoice = invoice, CreatedByUserId = actor.UserId, CreatedByUser = actor.User!,
            CreatedAt = clock.UtcNow, AdjustmentDate = request.AdjustmentDate!.Value, SignedAmount = request.SignedAmount,
            Reason = request.Reason.Trim(), Lines = lines };
        db.DebtAdjustments.Add(adjustment);
        await Save(adjustment, "Adjustment.CreateDraft", null, ct);
        await transaction.CommitAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = adjustment.AdjustmentId }, View(adjustment, remaining));
    }

    [HttpPut("{id:long:min(1)}"), Authorize(Policy = "Adjustments.Write")]
    public async Task<IActionResult> Update(long id, UpdateAdjustmentRequest request, CancellationToken ct)
    {
        var invoiceId = await db.DebtAdjustments.AsNoTracking().Where(x => x.AdjustmentId == id).Select(x => (long?)x.InvoiceId).SingleOrDefaultAsync(ct);
        if (!invoiceId.HasValue) return Missing();
        if (invoiceId != request.InvoiceId) return Problem(statusCode: 400, title: "Không đổi hóa đơn của điều chỉnh. Hãy lập bản nháp khác.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var invoice = await LockInvoice(invoiceId.Value, ct);
        var adjustment = await LockAdjustment(id, ct);
        if (adjustment is null || invoice is null) return Missing();
        if (adjustment.Status != "Draft") return Problem(statusCode: 409, title: "Chỉ được sửa điều chỉnh nháp.");
        if (!adjustment.RowVersion.AsSpan().SequenceEqual(request.RowVersion) || !invoice.RowVersion.AsSpan().SequenceEqual(request.InvoiceRowVersion)) return Stale();
        var lines = await Validate(request, ct);
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var remaining = await ReceivableBalances.Remaining(db, invoice, ct);
        if (!ValidBalance(remaining + request.SignedAmount)) return InvalidBalance();
        var before = Snapshot(adjustment);
        db.DebtAdjustmentLines.RemoveRange(adjustment.Lines);
        adjustment.Lines = lines; adjustment.AdjustmentDate = request.AdjustmentDate!.Value;
        adjustment.SignedAmount = request.SignedAmount; adjustment.Reason = request.Reason.Trim();
        db.Entry(adjustment).Property(x => x.SignedAmount).IsModified = true;
        await Save(adjustment, "Adjustment.UpdateDraft", before, ct);
        await transaction.CommitAsync(ct);
        return Ok(View(adjustment, remaining));
    }

    [HttpPost("{id:long:min(1)}/post"), Authorize(Policy = "Adjustments.Write")]
    public Task<IActionResult> Post(long id, AdjustmentVersionRequest request, CancellationToken ct) => Transition(id, request, null, ct);
    [HttpPost("{id:long:min(1)}/reverse"), Authorize(Policy = "Adjustments.Write")]
    public Task<IActionResult> Reverse(long id, ReverseAdjustmentRequest request, CancellationToken ct) => Transition(id, request, request.Note.Trim(), ct);

    private async Task<IActionResult> Transition(long id, AdjustmentVersionRequest request, string? reversalReason, CancellationToken ct)
    {
        var invoiceId = await db.DebtAdjustments.AsNoTracking().Where(x => x.AdjustmentId == id).Select(x => (long?)x.InvoiceId).SingleOrDefaultAsync(ct);
        if (!invoiceId.HasValue) return Missing();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // All adjustment writes lock the invoice first, matching allocation/reminder writers.
        var invoice = await LockInvoice(invoiceId.Value, ct);
        var adjustment = await LockAdjustment(id, ct);
        if (invoice is null || adjustment is null) return Missing();
        if (!adjustment.RowVersion.AsSpan().SequenceEqual(request.RowVersion) || !invoice.RowVersion.AsSpan().SequenceEqual(request.InvoiceRowVersion)) return Stale();
        var reverse = reversalReason is not null;
        if (adjustment.Status != (reverse ? "Posted" : "Draft")) return Problem(statusCode: 409, title: "Trạng thái điều chỉnh không cho phép thao tác này.");
        var remaining = await ReceivableBalances.Remaining(db, invoice, ct);
        var next = remaining + (reverse ? -adjustment.SignedAmount : adjustment.SignedAmount);
        if (!ValidBalance(next)) return InvalidBalance();
        var before = Snapshot(adjustment);
        JournalEntry entry;
        if (reverse) {
            var original = adjustment.JournalEntries.SingleOrDefault(x => x.EntryType == "Original");
            if (original is null || original.Lines.Count < 2 || original.Lines.Sum(x => x.DebitAmount) != original.Lines.Sum(x => x.CreditAmount))
                return Problem(statusCode: 409, title: "Chứng từ gốc không đầy đủ hoặc không cân bằng. Chưa thể đảo.");
            entry = NewEntry(adjustment, "Reversal", clock.Today, reversalReason!, original.Lines.Select(x => new JournalEntryLine {
                Account = x.Account, DebitAmount = x.CreditAmount, CreditAmount = x.DebitAmount }).ToList());
            adjustment.Status = "Reversed"; adjustment.ReversedAt = clock.UtcNow; adjustment.ReversalReason = reversalReason;
        } else {
            var draft = new SaveAdjustmentRequest { InvoiceId = invoice.InvoiceId, AdjustmentDate = adjustment.AdjustmentDate,
                SignedAmount = adjustment.SignedAmount, Reason = adjustment.Reason, Lines = adjustment.Lines.Select(x => new AdjustmentLineRequest {
                    AccountId = x.AccountId, DebitAmount = x.DebitAmount, CreditAmount = x.CreditAmount }).ToList() };
            await Validate(draft, ct);
            if (!ModelState.IsValid) return ValidationProblem(ModelState);
            entry = NewEntry(adjustment, "Original", adjustment.AdjustmentDate, adjustment.Reason,
                adjustment.Lines.Select(x => new JournalEntryLine { Account = x.Account, DebitAmount = x.DebitAmount, CreditAmount = x.CreditAmount }).ToList());
            adjustment.Status = "Posted"; adjustment.PostedAt = clock.UtcNow;
        }
        adjustment.JournalEntries.Add(entry);
        db.Entry(invoice).Property(x => x.TotalAmount).IsModified = true; // Invalidate all cached balance previews.
        await Save(adjustment, reverse ? "Adjustment.Reverse" : "Adjustment.Post", before, ct);
        await transaction.CommitAsync(ct);
        return Ok(View(adjustment, next));
    }

    private async Task<List<DebtAdjustmentLine>> Validate(SaveAdjustmentRequest request, CancellationToken ct)
    {
        if (request.SignedAmount == 0 || decimal.Round(request.SignedAmount, 2) != request.SignedAmount)
            ModelState.AddModelError("signedAmount", "Điều chỉnh phải khác 0 và tối đa 2 chữ số thập phân.");
        if (request.AdjustmentDate is null || request.AdjustmentDate > clock.Today)
            ModelState.AddModelError("adjustmentDate", "Ngày điều chỉnh không được ở tương lai.");
        var accounts = await db.AccountingAccounts.FromSqlRaw("SELECT * FROM [AccountingAccounts] WITH (HOLDLOCK)").ToDictionaryAsync(x => x.AccountId, ct);
        var result = new List<DebtAdjustmentLine>();
        if (request.Lines.Count is < 2 or > 30 || request.Lines.Any(x => x is null)) {
            ModelState.AddModelError("lines", "Cần từ 2 đến 30 dòng bút toán hợp lệ."); return result;
        }
        foreach (var line in request.Lines) {
            if (!accounts.TryGetValue(line.AccountId, out var account) || !account.IsActive) { ModelState.AddModelError("lines", "Tài khoản không tồn tại hoặc đã ngừng sử dụng."); continue; }
            if (line.DebitAmount < 0 || line.CreditAmount < 0 || line.DebitAmount > ReceivableBalances.MaxMoney || line.CreditAmount > ReceivableBalances.MaxMoney
                || (line.DebitAmount > 0) == (line.CreditAmount > 0) || decimal.Round(line.DebitAmount, 2) != line.DebitAmount || decimal.Round(line.CreditAmount, 2) != line.CreditAmount)
                ModelState.AddModelError("lines", "Mỗi dòng ghi tiền dương ở đúng một bên Nợ hoặc Có, tối đa 2 chữ số thập phân.");
            result.Add(new DebtAdjustmentLine { Account = account, DebitAmount = line.DebitAmount, CreditAmount = line.CreditAmount });
        }
        var debit = result.Sum(x => x.DebitAmount); var credit = result.Sum(x => x.CreditAmount);
        var ar = result.Where(x => x.Account.IsReceivable).ToList();
        if (debit != credit || debit <= 0 || debit > ReceivableBalances.MaxMoney)
            ModelState.AddModelError("lines", "Tổng Nợ phải bằng tổng Có, lớn hơn 0 và trong phạm vi hỗ trợ.");
        if (ar.Count == 0 || ar.Sum(x => x.DebitAmount - x.CreditAmount) != request.SignedAmount
            || ar.Any(x => request.SignedAmount > 0 ? x.CreditAmount != 0 : x.DebitAmount != 0))
            ModelState.AddModelError("lines", "Phần tài khoản phải thu phải khớp số điều chỉnh: tăng ghi Nợ, giảm ghi Có; các tài khoản còn lại đối ứng cân bằng.");
        return result;
    }
    private static bool ValidBalance(decimal value) => value >= 0 && value <= ReceivableBalances.MaxMoney;
    private JournalEntry NewEntry(DebtAdjustment a, string type, DateOnly date, string description, List<JournalEntryLine> lines) => new() {
        Adjustment = a, EntryType = type, EntryDate = date, PostedAt = clock.UtcNow, Description = description,
        PostedByUserId = actor.UserId, PostedByUser = actor.User!, Lines = lines };
    private static IQueryable<DebtAdjustment> Load(IQueryable<DebtAdjustment> q) => q.Include(x => x.Invoice).ThenInclude(x => x.Customer)
        .Include(x => x.CreatedByUser).Include(x => x.Lines).ThenInclude(x => x.Account)
        .Include(x => x.JournalEntries).ThenInclude(x => x.Lines).ThenInclude(x => x.Account)
        .Include(x => x.JournalEntries).ThenInclude(x => x.PostedByUser).AsSplitQuery();
    private Task<DebtAdjustment?> LockAdjustment(long id, CancellationToken ct) => Load(db.DebtAdjustments.FromSqlInterpolated(
        $"SELECT * FROM [DebtAdjustments] WITH (UPDLOCK, HOLDLOCK) WHERE [AdjustmentId] = {id}")).SingleOrDefaultAsync(ct);
    private Task<Invoice?> LockInvoice(long id, CancellationToken ct) => db.Invoices.FromSqlInterpolated(
        $"SELECT * FROM [Invoices] WITH (UPDLOCK, HOLDLOCK) WHERE [InvoiceId] = {id}").Include(x => x.Customer).SingleOrDefaultAsync(ct);
    private async Task Save(DebtAdjustment a, string action, object? before, CancellationToken ct) {
        await db.SaveChangesAsync(ct);
        db.AuditLogs.Add(new AuditLog { UserId = actor.UserId, EntityName = "DebtAdjustments", EntityId = a.AdjustmentId.ToString(CultureInfo.InvariantCulture),
            Action = action, ActionTime = clock.UtcNow, Description = JsonSerializer.Serialize(new { Before = before, After = Snapshot(a) }) });
        await db.SaveChangesAsync(ct);
    }
    private static object Snapshot(DebtAdjustment a) => new { a.InvoiceId, a.AdjustmentDate, SignedAmount = Money(a.SignedAmount), a.Reason,
        a.Status, a.PostedAt, a.ReversedAt, a.ReversalReason,
        Lines = a.Lines.OrderBy(x => x.DebtAdjustmentLineId).Select(x => new { x.AccountId, DebitAmount = Money(x.DebitAmount), CreditAmount = Money(x.CreditAmount) }).ToArray(),
        Entries = a.JournalEntries.Select(x => new { x.JournalEntryId, x.EntryType, x.PostedByUserId }).ToArray() };
    private object View(DebtAdjustment a, decimal remaining) => new { a.AdjustmentId, a.InvoiceId, a.Invoice.InvoiceNumber,
        customerCode = a.Invoice.Customer.CustomerCode, customerName = a.Invoice.Customer.CustomerName,
        originalAmount = Money(a.Invoice.TotalAmount), remainingAmount = Money(remaining), invoiceRowVersion = a.Invoice.RowVersion,
        a.CreatedByUserId, creatorName = a.CreatedByUser.FullName, a.CreatedAt, a.AdjustmentDate, signedAmount = Money(a.SignedAmount),
        a.Reason, a.Status, a.PostedAt, a.ReversedAt, a.ReversalReason, a.RowVersion, asOfDate = clock.Today,
        lines = a.Lines.OrderBy(x => x.DebtAdjustmentLineId).Select(x => new { x.AccountId, x.Account.AccountCode, x.Account.AccountName,
            x.Account.IsReceivable, debitAmount = Money(x.DebitAmount), creditAmount = Money(x.CreditAmount) }).ToArray(),
        journalEntries = a.JournalEntries.OrderBy(x => x.JournalEntryId).Select(x => new { x.JournalEntryId, x.EntryType,
            x.EntryDate, x.PostedAt, x.Description, actorName = x.PostedByUser.FullName,
            totalDebit = Money(x.Lines.Sum(l => l.DebitAmount)), totalCredit = Money(x.Lines.Sum(l => l.CreditAmount)),
            lines = x.Lines.OrderBy(l => l.JournalEntryLineId).Select(l => new { l.AccountId, l.Account.AccountCode,
                l.Account.AccountName, debitAmount = Money(l.DebitAmount), creditAmount = Money(l.CreditAmount) }).ToArray() }).ToArray() };
}
