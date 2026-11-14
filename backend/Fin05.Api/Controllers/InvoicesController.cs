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

[ApiController, Route("api/invoices"), Authorize(Policy = "Invoices.Read")]
public sealed class InvoicesController(Fin05DbContext db, CurrentAppUser actor, BusinessClock clock) : ControllerBase
{
    private const decimal MaxMoney = 9999999999999999.99m;
    private static string Money(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
    private static string Quantity(decimal value) => value.ToString("0.###", CultureInfo.InvariantCulture);

    [HttpGet]
    public async Task<IActionResult> List([FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, 100)] int pageSize = 20,
        [FromQuery, StringLength(200)] string? search = null,
        [FromQuery] string? status = null, CancellationToken cancellationToken = default)
    {
        if ((long)(page - 1) * pageSize > int.MaxValue) return Problem(statusCode: 400, title: "Số trang vượt phạm vi hỗ trợ.");
        if (status is not null && status is not ("Draft" or "Issued" or "Cancelled")) return Problem(statusCode: 400, title: "Trạng thái hóa đơn không hợp lệ.");
        var query = db.Invoices.AsNoTracking();
        if (status is not null) query = query.Where(x => x.IssueStatus == status);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            var id = long.TryParse(term, out var parsed) ? parsed : -1;
            query = query.Where(x => x.InvoiceId == id || (x.InvoiceNumber != null && x.InvoiceNumber.Contains(term))
                || x.Customer.CustomerName.Contains(term) || x.Customer.CustomerCode.Contains(term));
        }
        var total = await query.CountAsync(cancellationToken);
        var rows = await query.OrderByDescending(x => x.InvoiceId).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { x.InvoiceId, x.InvoiceNumber, x.CustomerId, customerCode = x.Customer.CustomerCode,
                customerName = x.Customer.CustomerName, x.InvoiceDate, x.DueDate, x.TotalAmount, x.IssueStatus,
                creatorName = x.CreatedByUser.FullName }).ToListAsync(cancellationToken);
        return Ok(new { items = rows.Select(x => new { x.InvoiceId, x.InvoiceNumber, x.CustomerId, x.customerCode,
            x.customerName, invoiceDate = DateOnly.FromDateTime(x.InvoiceDate), x.DueDate,
            totalAmount = Money(x.TotalAmount), x.IssueStatus, x.creatorName }), total, page, pageSize });
    }

    [HttpGet("{id:long:min(1)}")]
    public async Task<IActionResult> Get(long id, CancellationToken cancellationToken)
    {
        var invoice = await db.Invoices.AsNoTracking().Include(x => x.Customer).Include(x => x.CreatedByUser)
            .Include(x => x.Items).SingleOrDefaultAsync(x => x.InvoiceId == id, cancellationToken);
        return invoice is null ? Missing() : Ok(View(invoice));
    }

    [HttpPost, Authorize(Policy = "Invoices.Write")]
    public async Task<IActionResult> Create(SaveInvoiceRequest request, CancellationToken cancellationToken)
    {
        var items = BuildItems(request);
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var customer = await LockActiveCustomer(request.CustomerId, cancellationToken);
        if (customer is null) return InvalidCustomer();
        var invoice = new Invoice { CustomerId = request.CustomerId, Customer = customer,
            CreatedByUserId = actor.UserId, CreatedByUser = actor.User!,
            InvoiceDate = request.InvoiceDate!.Value.ToDateTime(TimeOnly.MinValue), DueDate = request.DueDate!.Value,
            Items = items, TotalAmount = items.Sum(x => x.LineAmount) };
        db.Invoices.Add(invoice);
        await SaveWithAudit(invoice, "Invoice.CreateDraft", null, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = invoice.InvoiceId }, View(invoice));
    }

    [HttpPut("{id:long:min(1)}"), Authorize(Policy = "Invoices.Write")]
    public async Task<IActionResult> Update(long id, UpdateInvoiceRequest request, CancellationToken cancellationToken)
    {
        var items = BuildItems(request);
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var invoice = await db.Invoices.Include(x => x.Items).Include(x => x.Customer).Include(x => x.CreatedByUser)
            .SingleOrDefaultAsync(x => x.InvoiceId == id, cancellationToken);
        if (invoice is null) return Missing();
        if (invoice.IssueStatus != "Draft") return NotDraft();
        if (!invoice.RowVersion.AsSpan().SequenceEqual(request.RowVersion)) return Stale();
        var before = Snapshot(invoice);
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var customer = await LockActiveCustomer(request.CustomerId, cancellationToken);
        if (customer is null) return InvalidCustomer();
        var proposed = new Invoice { CustomerId = request.CustomerId,
            InvoiceDate = request.InvoiceDate!.Value.ToDateTime(TimeOnly.MinValue), DueDate = request.DueDate!.Value,
            Items = items, TotalAmount = items.Sum(x => x.LineAmount) };
        if (JsonSerializer.Serialize(before) == JsonSerializer.Serialize(Snapshot(proposed))) return Ok(View(invoice));
        invoice.CustomerId = proposed.CustomerId;
        invoice.Customer = customer;
        invoice.InvoiceDate = proposed.InvoiceDate;
        invoice.DueDate = proposed.DueDate;
        invoice.TotalAmount = proposed.TotalAmount;
        db.InvoiceItems.RemoveRange(invoice.Items);
        invoice.Items = items;
        // Even a description-only line edit must update the parent rowversion.
        db.Entry(invoice).Property(x => x.TotalAmount).IsModified = true;
        try { await SaveWithAudit(invoice, "Invoice.UpdateDraft", before, cancellationToken); }
        catch (DbUpdateConcurrencyException) { return Stale(); }
        await transaction.CommitAsync(cancellationToken);
        return Ok(View(invoice));
    }

    [HttpPost("{id:long:min(1)}/cancel"), Authorize(Policy = "Invoices.Write")]
    public async Task<IActionResult> Cancel(long id, InvoiceVersionRequest request, CancellationToken cancellationToken)
    {
        var invoice = await db.Invoices.Include(x => x.Items).Include(x => x.Customer).Include(x => x.CreatedByUser)
            .SingleOrDefaultAsync(x => x.InvoiceId == id, cancellationToken);
        if (invoice is null) return Missing();
        if (invoice.IssueStatus != "Draft") return NotDraft();
        if (!invoice.RowVersion.AsSpan().SequenceEqual(request.RowVersion)) return Stale();
        var before = Snapshot(invoice);
        invoice.IssueStatus = "Cancelled";
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        try { await SaveWithAudit(invoice, "Invoice.CancelDraft", before, cancellationToken); }
        catch (DbUpdateConcurrencyException) { return Stale(); }
        await transaction.CommitAsync(cancellationToken);
        return Ok(View(invoice));
    }

    [HttpPost("{id:long:min(1)}/issue"), Authorize(Policy = "Invoices.Write")]
    public async Task<IActionResult> Issue(long id, InvoiceVersionRequest request, CancellationToken cancellationToken)
    {
        var invoice = await db.Invoices.Include(x => x.Items).Include(x => x.Customer).Include(x => x.CreatedByUser)
            .SingleOrDefaultAsync(x => x.InvoiceId == id, cancellationToken);
        if (invoice is null) return Missing();
        if (invoice.IssueStatus != "Draft") return Problem(statusCode: 409, title: "Hóa đơn đã phát hành hoặc hủy. Không thể phát hành lần nữa.");
        if (!invoice.RowVersion.AsSpan().SequenceEqual(request.RowVersion)) return Stale();
        if (invoice.Items.Count == 0 || invoice.Items.Any(x => string.IsNullOrWhiteSpace(x.Description)
            || x.Quantity <= 0 || x.Quantity > 999999999.999m || decimal.Round(x.Quantity, 3) != x.Quantity
            || x.UnitPrice < 0 || x.UnitPrice > 999999999999.99m || decimal.Round(x.UnitPrice, 2) != x.UnitPrice)
            || invoice.DueDate < DateOnly.FromDateTime(invoice.InvoiceDate))
            return Problem(statusCode: 400, title: "Hóa đơn phải có ít nhất một dòng hợp lệ và hạn thanh toán hợp lệ trước khi phát hành.");
        var amounts = invoice.Items.Select(x => decimal.Round(x.Quantity * x.UnitPrice, 2, MidpointRounding.AwayFromZero)).ToArray();
        var total = amounts.Sum();
        if (total <= 0 || total > MaxMoney || total != invoice.TotalAmount
            || invoice.Items.Any(x => x.LineAmount != decimal.Round(x.Quantity * x.UnitPrice, 2, MidpointRounding.AwayFromZero)))
            return Problem(statusCode: 400, title: "Tổng tiền không hợp lệ. Hãy mở sửa nháp và lưu lại trước khi phát hành.");
        if (invoice.InvoiceNumber is not null || invoice.IssuedAt is not null)
            return Problem(statusCode: 409, title: "Thông tin phát hành của bản nháp không nhất quán. Vui lòng kiểm tra lại.");
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        if (await LockActiveCustomer(invoice.CustomerId, cancellationToken) is null) return InvalidCustomer();
        var before = Snapshot(invoice);
        invoice.InvoiceNumber = $"SIM-{clock.Today.Year}-{invoice.InvoiceId:D10}";
        invoice.IssuedAt = clock.UtcNow;
        invoice.IssueStatus = "Issued";
        try { await SaveWithAudit(invoice, "Invoice.Issue", before, cancellationToken); }
        catch (DbUpdateConcurrencyException) { return Stale(); }
        await transaction.CommitAsync(cancellationToken);
        return Ok(View(invoice));
    }

    private List<InvoiceItem> BuildItems(SaveInvoiceRequest request)
    {
        if (request.DueDate < request.InvoiceDate) ModelState.AddModelError("dueDate", "Hạn thanh toán không được trước ngày lập.");
        var items = new List<InvoiceItem>();
        for (var i = 0; i < request.Items.Count; i++)
        {
            var line = request.Items[i];
            if (line is null) { ModelState.AddModelError($"items[{i}]", "Dòng hóa đơn không hợp lệ."); continue; }
            if (decimal.Round(line.Quantity, 3) != line.Quantity) ModelState.AddModelError($"items[{i}].quantity", "Số lượng tối đa 3 chữ số thập phân.");
            if (decimal.Round(line.UnitPrice, 2) != line.UnitPrice) ModelState.AddModelError($"items[{i}].unitPrice", "Đơn giá tối đa 2 chữ số thập phân.");
            var amount = decimal.Round(line.Quantity * line.UnitPrice, 2, MidpointRounding.AwayFromZero);
            if (amount > MaxMoney) ModelState.AddModelError($"items[{i}]", "Thành tiền vượt phạm vi hỗ trợ.");
            items.Add(new InvoiceItem { Description = line.Description.Trim(), Quantity = line.Quantity,
                UnitPrice = line.UnitPrice, LineAmount = amount });
        }
        if (items.Sum(x => x.LineAmount) > MaxMoney) ModelState.AddModelError("items", "Tổng hóa đơn vượt phạm vi hỗ trợ.");
        return items;
    }

    private async Task<Customer?> LockActiveCustomer(long id, CancellationToken cancellationToken)
    {
        var customer = await db.Customers.FromSqlInterpolated($"SELECT * FROM [Customers] WITH (UPDLOCK, HOLDLOCK) WHERE [CustomerId] = {id}")
            .SingleOrDefaultAsync(cancellationToken);
        if (customer is not null) await db.Entry(customer).ReloadAsync(cancellationToken);
        return customer?.IsActive == true ? customer : null;
    }

    private async Task SaveWithAudit(Invoice invoice, string action, object? before, CancellationToken cancellationToken)
    {
        await db.SaveChangesAsync(cancellationToken);
        db.AuditLogs.Add(new AuditLog { UserId = actor.UserId, Action = action, EntityName = "Invoices",
            EntityId = invoice.InvoiceId.ToString(CultureInfo.InvariantCulture),
            Description = JsonSerializer.Serialize(new { Before = before, After = Snapshot(invoice) }) });
        await db.SaveChangesAsync(cancellationToken);
    }

    private static object Snapshot(Invoice invoice) => new { invoice.CustomerId, invoice.InvoiceNumber,
        IssuedAt = invoice.IssuedAt.HasValue ? DateTime.SpecifyKind(invoice.IssuedAt.Value, DateTimeKind.Utc) : (DateTime?)null,
        InvoiceDate = DateOnly.FromDateTime(invoice.InvoiceDate), invoice.DueDate,
        TotalAmount = Money(invoice.TotalAmount), invoice.IssueStatus,
        Items = invoice.Items.OrderBy(x => x.InvoiceItemId).Select(x => new { x.Description,
            Quantity = Quantity(x.Quantity), UnitPrice = Money(x.UnitPrice), LineAmount = Money(x.LineAmount) }) };

    private static object View(Invoice invoice) => new { invoice.InvoiceId, invoice.InvoiceNumber,
        invoice.CustomerId, customerCode = invoice.Customer.CustomerCode, customerName = invoice.Customer.CustomerName,
        customerIsActive = invoice.Customer.IsActive, invoice.CreatedByUserId, creatorName = invoice.CreatedByUser.FullName,
        invoiceDate = DateOnly.FromDateTime(invoice.InvoiceDate), invoice.DueDate,
        totalAmount = Money(invoice.TotalAmount), invoice.IssueStatus,
        issuedAt = invoice.IssuedAt.HasValue ? DateTime.SpecifyKind(invoice.IssuedAt.Value, DateTimeKind.Utc) : (DateTime?)null, invoice.RowVersion,
        items = invoice.Items.OrderBy(x => x.InvoiceItemId).Select(x => new { x.InvoiceItemId, x.Description,
            quantity = Quantity(x.Quantity), unitPrice = Money(x.UnitPrice), lineAmount = Money(x.LineAmount) }) };
    private ObjectResult Missing() => Problem(statusCode: 404, title: "Không tìm thấy hóa đơn.");
    private ObjectResult NotDraft() => Problem(statusCode: 409, title: "Chỉ được sửa hoặc hủy hóa đơn còn ở trạng thái nháp.");
    private ObjectResult Stale() => Problem(statusCode: 409, title: "Hóa đơn đã thay đổi ở nơi khác. Tải lại danh sách và mở lại hóa đơn.");
    private ObjectResult InvalidCustomer() => Problem(statusCode: 400, title: "Khách hàng không tồn tại hoặc đã ngừng hoạt động.");
}
