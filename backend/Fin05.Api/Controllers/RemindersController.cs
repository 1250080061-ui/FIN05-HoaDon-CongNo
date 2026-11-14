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

[ApiController, Route("api/reminders"), Authorize(Policy = "Reminders.Read")]
public sealed class RemindersController(Fin05DbContext db, CurrentAppUser actor, BusinessClock clock) : ControllerBase
{
    private static string Money(decimal v) => v.ToString("0.00", CultureInfo.InvariantCulture);
    private ObjectResult Missing() => Problem(statusCode: 404, title: "Không tìm thấy thông báo nhắc nợ.");
    private ObjectResult Stale() => Problem(statusCode: 409, title: "Hóa đơn hoặc nhắc nợ đã thay đổi. Hãy đóng và mở lại để kiểm tra dữ liệu mới.");

    [HttpGet("candidates")]
    public async Task<IActionResult> Candidates([FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, 100)] int pageSize = 20, [FromQuery, StringLength(200)] string? search = null,
        [FromQuery] string due = "All", CancellationToken cancellationToken = default)
    {
        if ((long)(page - 1) * pageSize > int.MaxValue || due is not ("All" or "Overdue" or "Upcoming"))
            return Problem(statusCode: 400, title: "Trang hoặc bộ lọc thời hạn không hợp lệ.");
        var today = clock.Today; var limit = today.AddDays(7);
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
        var query = ReceivableBalances.Query(db).Where(x => x.DueDate <= limit)
            .Select(x => new { x.InvoiceId, x.InvoiceNumber, x.CustomerId, x.CustomerCode, x.CustomerName,
                x.Phone, x.Email, x.DueDate, x.RowVersion, remaining = x.RemainingAmount,
                activeReminderId = db.DebtReminders.Where(r => r.InvoiceId == x.InvoiceId && r.Status != "Closed").Select(r => (long?)r.ReminderId).FirstOrDefault() })
            .Where(x => x.remaining > 0);
        if (due == "Overdue") query = query.Where(x => x.DueDate < today);
        if (due == "Upcoming") query = query.Where(x => x.DueDate >= today);
        if (!string.IsNullOrWhiteSpace(search)) {
            var term = search.Trim();
            query = query.Where(x => x.InvoiceNumber!.Contains(term) || x.CustomerCode.Contains(term) || x.CustomerName.Contains(term));
        }
        var count = await query.CountAsync(cancellationToken);
        var rows = await query.OrderBy(x => x.DueDate).ThenBy(x => x.InvoiceId).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Ok(new { asOfDate = today, upcomingDays = 7, total = count, page, pageSize,
            items = rows.Select(x => new { x.InvoiceId, x.InvoiceNumber, x.CustomerId, x.CustomerCode, x.CustomerName,
                x.Phone, x.Email, x.DueDate, invoiceRowVersion = x.RowVersion, x.activeReminderId,
                remainingAmount = Money(x.remaining), isOverdue = x.DueDate < today,
                overdueDays = Math.Max(0, today.DayNumber - x.DueDate.DayNumber) }) });
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, 100)] int pageSize = 20, [FromQuery, StringLength(200)] string? search = null,
        [FromQuery] string? status = null, [FromQuery, Range(1, long.MaxValue)] long? invoiceId = null,
        [FromQuery] DateOnly? fromDate = null, [FromQuery] DateOnly? toDate = null, CancellationToken cancellationToken = default)
    {
        if ((long)(page - 1) * pageSize > int.MaxValue || status is not null && status is not ("Open" or "Contacted" or "Closed") || fromDate > toDate)
            return Problem(statusCode: 400, title: "Trang, trạng thái hoặc khoảng ngày dự kiến không hợp lệ.");
        var query = db.DebtReminders.AsNoTracking();
        if (invoiceId.HasValue) query = query.Where(x => x.InvoiceId == invoiceId);
        if (status is not null) query = query.Where(x => x.Status == status);
        if (fromDate.HasValue) query = query.Where(x => x.ScheduledDate >= fromDate);
        if (toDate.HasValue) query = query.Where(x => x.ScheduledDate <= toDate);
        if (!string.IsNullOrWhiteSpace(search)) {
            var term = search.Trim(); var id = long.TryParse(term, out var value) ? value : -1;
            query = query.Where(x => x.ReminderId == id || x.Invoice.InvoiceNumber!.Contains(term)
                || x.Invoice.Customer.CustomerCode.Contains(term) || x.Invoice.Customer.CustomerName.Contains(term));
        }
        var count = await query.CountAsync(cancellationToken);
        var withBalances = query.Join(ReceivableBalances.Query(db), r => r.InvoiceId, b => b.InvoiceId, (r, b) => new { r, b.RemainingAmount });
        var rows = await withBalances.OrderByDescending(x => x.r.ReminderId).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { x.r.ReminderId, x.r.InvoiceId, x.r.Invoice.InvoiceNumber, x.r.Invoice.Customer.CustomerCode,
                x.r.Invoice.Customer.CustomerName, x.r.ReminderDate, x.r.ScheduledDate, x.r.Status, x.r.ContactedAt, x.r.ClosedAt,
                creatorName = x.r.CreatedByUser.FullName, remaining = x.RemainingAmount })
            .ToListAsync(cancellationToken);
        return Ok(new { total = count, page, pageSize, items = rows.Select(x => new { x.ReminderId, x.InvoiceId,
            x.InvoiceNumber, x.CustomerCode, x.CustomerName, x.ReminderDate, x.ScheduledDate, x.Status,
            x.ContactedAt, x.ClosedAt, x.creatorName, remainingAmount = Money(x.remaining) }) });
    }

    [HttpGet("{id:long:min(1)}")]
    public async Task<IActionResult> Get(long id, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
        var reminder = await db.DebtReminders.AsNoTracking().Include(x => x.Invoice).ThenInclude(x => x.Customer)
            .Include(x => x.CreatedByUser).SingleOrDefaultAsync(x => x.ReminderId == id, cancellationToken);
        if (reminder is null) return Missing();
        var remaining = await Remaining(reminder.Invoice, cancellationToken);
        var entityId = id.ToString(CultureInfo.InvariantCulture);
        var history = await db.AuditLogs.AsNoTracking().Where(x => x.EntityName == "DebtReminders" && x.EntityId == entityId)
            .OrderBy(x => x.AuditLogId).Select(x => new { x.Action, x.ActionTime, actorName = x.User != null ? x.User.FullName : "Hệ thống" }).ToListAsync(cancellationToken);
        var detail = View(reminder, remaining);
        await transaction.CommitAsync(cancellationToken);
        return Ok(new { detail, history });
    }

    [HttpPost, Authorize(Policy = "Reminders.Write")]
    public async Task<IActionResult> Create(SaveReminderRequest request, CancellationToken cancellationToken)
    {
        if (request.ScheduledDate < clock.Today || request.ScheduledDate > clock.Today.AddDays(30))
            ModelState.AddModelError("scheduledDate", "Ngày dự kiến phải từ hôm nay đến 30 ngày tới.");
        if (request.ContactChannel == "Email" && !new EmailAddressAttribute().IsValid(request.ContactInfo.Trim()))
            ModelState.AddModelError("contactInfo", "Địa chỉ email liên hệ không hợp lệ.");
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var invoice = await LockInvoice(request.InvoiceId, cancellationToken);
        if (invoice is null) return Problem(statusCode: 400, title: "Không tìm thấy hóa đơn cần nhắc nợ.");
        if (!invoice.RowVersion.AsSpan().SequenceEqual(request.InvoiceRowVersion)) return Stale();
        var remaining = await Remaining(invoice, cancellationToken);
        if (invoice.IssueStatus != "Issued" || remaining <= 0 || invoice.DueDate > clock.Today.AddDays(7))
            return Problem(statusCode: 409, title: "Hóa đơn phải đã phát hành, còn công nợ và đến hạn trong 7 ngày tới hoặc đã quá hạn.");
        if (await db.DebtReminders.AnyAsync(x => x.InvoiceId == invoice.InvoiceId && x.Status != "Closed", cancellationToken))
            return Problem(statusCode: 409, title: "Hóa đơn đã có nhắc nợ đang xử lý. Hãy mở thông báo hiện có thay vì tạo trùng.");
        var reminder = new DebtReminder { Invoice = invoice, CreatedByUserId = actor.UserId, CreatedByUser = actor.User!,
            ReminderDate = clock.UtcNow, ScheduledDate = request.ScheduledDate!.Value, BalanceAtCreation = remaining,
            Content = request.Content.Trim(), ContactChannel = request.ContactChannel, ContactInfo = request.ContactInfo.Trim() };
        db.DebtReminders.Add(reminder);
        await Save(reminder, "Reminder.Create", null, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = reminder.ReminderId }, View(reminder, remaining));
    }

    [HttpPost("{id:long:min(1)}/contact"), Authorize(Policy = "Reminders.Write")]
    public Task<IActionResult> Contact(long id, ReminderActionRequest request, CancellationToken cancellationToken) => Transition(id, request, false, cancellationToken);

    [HttpPost("{id:long:min(1)}/close"), Authorize(Policy = "Reminders.Write")]
    public Task<IActionResult> Close(long id, ReminderActionRequest request, CancellationToken cancellationToken) => Transition(id, request, true, cancellationToken);

    private async Task<IActionResult> Transition(long id, ReminderActionRequest request, bool close, CancellationToken ct)
    {
        // Invoice first, then reminder: the same order as creation, also compatible with allocation writers.
        var invoiceId = await db.DebtReminders.AsNoTracking().Where(x => x.ReminderId == id).Select(x => (long?)x.InvoiceId).SingleOrDefaultAsync(ct);
        if (!invoiceId.HasValue) return Missing();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var invoice = await LockInvoice(invoiceId.Value, ct);
        var reminder = await db.DebtReminders.FromSqlInterpolated($"SELECT * FROM [DebtReminders] WITH (UPDLOCK, HOLDLOCK) WHERE [ReminderId] = {id}")
            .Include(x => x.CreatedByUser).SingleOrDefaultAsync(ct);
        if (reminder is null || invoice is null) return Missing();
        if (!reminder.RowVersion.AsSpan().SequenceEqual(request.RowVersion)) return Stale();
        if (reminder.Status == "Closed" || !close && reminder.Status != "Open")
            return Problem(statusCode: 409, title: "Nhắc nợ đã chuyển trạng thái. Không thể thực hiện lại thao tác này.");
        var remaining = await Remaining(invoice, ct);
        if (!close && (invoice.IssueStatus != "Issued" || remaining <= 0))
            return Problem(statusCode: 409, title: "Hóa đơn không còn công nợ cần nhắc. Hãy đóng thông báo thay vì ghi nhận liên hệ mới.");
        var before = Snapshot(reminder);
        if (close) { reminder.Status = "Closed"; reminder.ClosedAt = clock.UtcNow; reminder.CloseReason = request.Note.Trim(); }
        else { reminder.Status = "Contacted"; reminder.ContactedAt = clock.UtcNow; reminder.ContactNote = request.Note.Trim(); }
        await Save(reminder, close ? "Reminder.Close" : "Reminder.Contact", before, ct);
        await transaction.CommitAsync(ct);
        return Ok(View(reminder, remaining));
    }

    private Task<Invoice?> LockInvoice(long id, CancellationToken ct) => db.Invoices
        .FromSqlInterpolated($"SELECT * FROM [Invoices] WITH (UPDLOCK, HOLDLOCK) WHERE [InvoiceId] = {id}")
        .Include(x => x.Customer).SingleOrDefaultAsync(ct);
    private Task<decimal> Remaining(Invoice invoice, CancellationToken ct) => ReceivableBalances.Remaining(db, invoice, ct);
    private async Task Save(DebtReminder reminder, string action, object? before, CancellationToken ct) {
        await db.SaveChangesAsync(ct);
        db.AuditLogs.Add(new AuditLog { UserId = actor.UserId, Action = action, EntityName = "DebtReminders",
            EntityId = reminder.ReminderId.ToString(CultureInfo.InvariantCulture), ActionTime = clock.UtcNow,
            Description = JsonSerializer.Serialize(new { Before = before, After = Snapshot(reminder) }) });
        await db.SaveChangesAsync(ct);
    }
    private static object Snapshot(DebtReminder r) => new { r.InvoiceId, r.CreatedByUserId, r.ReminderDate,
        r.ScheduledDate, BalanceAtCreation = Money(r.BalanceAtCreation), r.Content, r.ContactChannel, r.ContactInfo,
        r.Status, r.ContactedAt, r.ContactNote, r.ClosedAt, r.CloseReason };
    private object View(DebtReminder r, decimal remaining) => new { r.ReminderId, r.InvoiceId, r.Invoice.InvoiceNumber,
        customerCode = r.Invoice.Customer.CustomerCode, customerName = r.Invoice.Customer.CustomerName,
        r.Invoice.DueDate, remainingAmount = Money(remaining), balanceAtCreation = Money(r.BalanceAtCreation),
        r.CreatedByUserId, creatorName = r.CreatedByUser.FullName, r.ReminderDate, r.ScheduledDate, r.Content,
        r.ContactChannel, r.ContactInfo, r.Status, r.ContactedAt, r.ContactNote, r.ClosedAt, r.CloseReason, r.RowVersion,
        asOfDate = clock.Today, isOverdue = remaining > 0 && r.Invoice.DueDate < clock.Today };
}
