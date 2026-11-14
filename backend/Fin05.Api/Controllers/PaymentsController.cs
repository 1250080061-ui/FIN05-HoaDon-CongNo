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

[ApiController, Route("api/payments"), Authorize(Policy = "Payments.Read")]
public sealed class PaymentsController(Fin05DbContext db, CurrentAppUser actor, BusinessClock clock) : ControllerBase
{
    private static string Money(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
    private ObjectResult Stale() => Problem(statusCode: 409, title: "Phiếu thu hoặc số dư hóa đơn đã thay đổi. Hãy đóng và mở lại chi tiết để kiểm tra.");
    private ObjectResult Missing() => Problem(statusCode: 404, title: "Không tìm thấy phiếu thu.");

    [HttpGet]
    public async Task<IActionResult> List([FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, 100)] int pageSize = 20, [FromQuery, StringLength(200)] string? search = null,
        [FromQuery] string? status = null, CancellationToken cancellationToken = default)
    {
        if ((long)(page - 1) * pageSize > int.MaxValue || status is not null && status is not ("Draft" or "Confirmed"))
            return Problem(statusCode: 400, title: "Trang hoặc trạng thái phiếu thu không hợp lệ.");
        var query = db.Payments.AsNoTracking();
        if (status is not null) query = query.Where(x => x.Status == status);
        if (!string.IsNullOrWhiteSpace(search)) {
            var term = search.Trim();
            query = query.Where(x => x.PaymentNumber.Contains(term) || x.Customer.CustomerName.Contains(term)
                || x.Customer.CustomerCode.Contains(term) || x.ReferenceNumber != null && x.ReferenceNumber.Contains(term));
        }
        var count = await query.CountAsync(cancellationToken);
        var rows = await query.OrderByDescending(x => x.PaymentId).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { x.PaymentId, x.PaymentNumber, x.CustomerId, x.Customer.CustomerCode, x.Customer.CustomerName,
                x.PaymentDate, x.Amount, x.PaymentMethod, x.Status, allocated = x.Allocations.Sum(a => (decimal?)a.AllocatedAmount) ?? 0m })
            .ToListAsync(cancellationToken);
        return Ok(new { items = rows.Select(x => new { x.PaymentId, x.PaymentNumber, x.CustomerId, x.CustomerCode, x.CustomerName,
            x.PaymentDate, amount = Money(x.Amount), x.PaymentMethod, x.Status,
            allocatedAmount = Money(x.allocated), unallocatedAmount = Money(x.Amount - x.allocated) }), total = count, page, pageSize });
    }

    [HttpGet("{id:long:min(1)}")]
    public async Task<IActionResult> Get(long id, CancellationToken cancellationToken)
    {
        // One database snapshot of the document and its allocations, including during a concurrent allocation.
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
        var payment = await Load(id, cancellationToken);
        if (payment is null) return Missing();
        var result = View(payment);
        await transaction.CommitAsync(cancellationToken);
        return Ok(result);
    }

    [HttpPost, Authorize(Policy = "Payments.Write")]
    public async Task<IActionResult> Create(SavePaymentRequest request, CancellationToken cancellationToken)
    {
        Validate(request);
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var customer = await ActiveCustomer(request.CustomerId, cancellationToken);
        if (customer is null) return Problem(statusCode: 400, title: "Khách hàng không tồn tại hoặc đã ngừng hoạt động.");
        var payment = new Payment { CustomerId = request.CustomerId, Customer = customer, ReceivedByUserId = actor.UserId,
            ReceivedByUser = actor.User!, PaymentNumber = "TMP-" + Guid.NewGuid().ToString("N")[..24] };
        Apply(payment, request);
        db.Payments.Add(payment);
        await db.SaveChangesAsync(cancellationToken);
        payment.PaymentNumber = $"PT-{clock.Today.Year}-{payment.PaymentId:D10}";
        await Save(payment, "Payment.CreateDraft", null, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = payment.PaymentId }, View(payment));
    }

    [HttpPut("{id:long:min(1)}"), Authorize(Policy = "Payments.Write")]
    public async Task<IActionResult> Update(long id, UpdatePaymentRequest request, CancellationToken cancellationToken)
    {
        Validate(request);
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var payment = await LockPayment(id, cancellationToken);
        if (payment is null) return Missing();
        if (payment.Status != "Draft") return Problem(statusCode: 409, title: "Chỉ được sửa phiếu thu nháp. Phiếu đã xác nhận được khóa để giữ lịch sử.");
        if (!payment.RowVersion.AsSpan().SequenceEqual(request.RowVersion)) return Stale();
        var customer = await ActiveCustomer(request.CustomerId, cancellationToken);
        if (customer is null) return Problem(statusCode: 400, title: "Khách hàng không tồn tại hoặc đã ngừng hoạt động.");
        var before = Snapshot(payment);
        payment.Customer = customer; payment.CustomerId = request.CustomerId;
        Apply(payment, request);
        await Save(payment, "Payment.UpdateDraft", before, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Ok(View(payment));
    }

    [HttpPost("{id:long:min(1)}/confirm"), Authorize(Policy = "Payments.Write")]
    public async Task<IActionResult> Confirm(long id, InvoiceVersionRequest request, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var payment = await LockPayment(id, cancellationToken);
        if (payment is null) return Missing();
        if (payment.Status != "Draft") return Problem(statusCode: 409, title: "Phiếu thu đã được xác nhận.");
        if (!payment.RowVersion.AsSpan().SequenceEqual(request.RowVersion)) return Stale();
        if (await ActiveCustomer(payment.CustomerId, cancellationToken) is null)
            return Problem(statusCode: 400, title: "Khách hàng đã ngừng hoạt động. Chưa thể xác nhận phiếu thu.");
        var before = Snapshot(payment);
        payment.Status = "Confirmed"; payment.ConfirmedAt = clock.UtcNow;
        await Save(payment, "Payment.Confirm", before, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Ok(View(payment));
    }

    [HttpGet("{id:long:min(1)}/available-invoices"), Authorize(Policy = "Allocations.Write")]
    public async Task<IActionResult> AvailableInvoices(long id, [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, 100)] int pageSize = 20, CancellationToken cancellationToken = default)
    {
        if ((long)(page - 1) * pageSize > int.MaxValue) return Problem(statusCode: 400, title: "Số trang không hợp lệ.");
        var payment = await db.Payments.AsNoTracking().SingleOrDefaultAsync(x => x.PaymentId == id, cancellationToken);
        if (payment is null) return Missing();
        if (payment.Status != "Confirmed") return Problem(statusCode: 409, title: "Chỉ phân bổ phiếu thu đã xác nhận.");
        var query = ReceivableBalances.Query(db).Where(x => x.CustomerId == payment.CustomerId)
            .Select(x => new { x.InvoiceId, x.InvoiceNumber, x.DueDate, x.RowVersion,
                remaining = x.RemainingAmount })
            .Where(x => x.remaining > 0);
        var count = await query.CountAsync(cancellationToken);
        var rows = await query.OrderBy(x => x.DueDate).ThenBy(x => x.InvoiceId).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        return Ok(new { items = rows.Select(x => new { x.InvoiceId, x.InvoiceNumber, x.DueDate, x.RowVersion,
            remainingAmount = Money(x.remaining) }), total = count, page, pageSize });
    }

    [HttpPost("{id:long:min(1)}/allocations"), Authorize(Policy = "Allocations.Write")]
    public async Task<IActionResult> Allocate(long id, AllocatePaymentRequest request, CancellationToken cancellationToken)
    {
        if (request.Items.Any(x => x is null)) return Problem(statusCode: 400, title: "Dòng phân bổ không hợp lệ.");
        if (request.Items.Select(x => x.InvoiceId).Distinct().Count() != request.Items.Count
            || request.Items.Any(x => decimal.Round(x.Amount, 2) != x.Amount))
            return Problem(statusCode: 400, title: "Mỗi hóa đơn chỉ được chọn một lần; số tiền tối đa 2 chữ số thập phân.");
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        // Every allocation writer locks its payment first, then invoice IDs in ascending order.
        // Locks survive until the audit and all allocations commit; no competing request can spend the same balance.
        var payment = await LockPayment(id, cancellationToken);
        if (payment is null) return Missing();
        if (payment.Status != "Confirmed") return Problem(statusCode: 409, title: "Chỉ phân bổ phiếu thu đã xác nhận.");
        if (!payment.RowVersion.AsSpan().SequenceEqual(request.RowVersion)) return Stale();
        var allocated = payment.Allocations.Sum(x => x.AllocatedAmount);
        if (request.Items.Sum(x => x.Amount) > payment.Amount - allocated)
            return Problem(statusCode: 400, title: "Tổng phân bổ vượt số tiền chưa phân bổ của phiếu thu.");
        var before = Snapshot(payment);
        foreach (var line in request.Items.OrderBy(x => x.InvoiceId)) {
            var invoice = await db.Invoices.FromSqlInterpolated($"SELECT * FROM [Invoices] WITH (UPDLOCK, HOLDLOCK) WHERE [InvoiceId] = {line.InvoiceId}")
                .SingleOrDefaultAsync(cancellationToken);
            if (invoice is null || invoice.IssueStatus != "Issued" || invoice.CustomerId != payment.CustomerId)
                return Problem(statusCode: 400, title: "Hóa đơn phải đã phát hành và thuộc cùng khách hàng với phiếu thu.");
            await db.Entry(invoice).ReloadAsync(cancellationToken);
            if (!invoice.RowVersion.AsSpan().SequenceEqual(line.RowVersion)) return Stale();
            var remaining = await ReceivableBalances.Remaining(db, invoice, cancellationToken);
            if (line.Amount > remaining)
                return Problem(statusCode: 400, title: "Số tiền phân bổ vượt số còn phải thu của hóa đơn.");
            payment.Allocations.Add(new PaymentAllocation { Invoice = invoice, AllocatedAmount = line.Amount,
                AllocationDate = clock.UtcNow, CreatedByUserId = actor.UserId, CreatedByUser = actor.User! });
            // Advance the version even though the original invoice amount stays unchanged.
            db.Entry(invoice).Property(x => x.TotalAmount).IsModified = true;
        }
        db.Entry(payment).Property(x => x.Amount).IsModified = true;
        await Save(payment, "Payment.Allocate", before, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Ok(View(payment));
    }

    private void Validate(SavePaymentRequest request)
    {
        if (decimal.Round(request.Amount, 2) != request.Amount) ModelState.AddModelError("amount", "Số tiền tối đa 2 chữ số thập phân.");
        if (request.PaymentDate > clock.Today) ModelState.AddModelError("paymentDate", "Ngày thu không được ở tương lai.");
        if (request.PaymentMethod == "BankTransfer" && string.IsNullOrWhiteSpace(request.ReferenceNumber))
            ModelState.AddModelError("referenceNumber", "Chuyển khoản cần mã tham chiếu để đối chiếu.");
    }
    private static void Apply(Payment payment, SavePaymentRequest request) {
        payment.PaymentDate = request.PaymentDate!.Value; payment.Amount = request.Amount;
        payment.PaymentMethod = request.PaymentMethod;
        payment.ReferenceNumber = string.IsNullOrWhiteSpace(request.ReferenceNumber) ? null : request.ReferenceNumber.Trim();
    }
    private Task<Payment?> Load(long id, CancellationToken ct) => db.Payments.AsNoTracking()
        .Include(x => x.Customer).Include(x => x.ReceivedByUser).Include(x => x.Allocations).ThenInclude(x => x.Invoice)
        .Include(x => x.Allocations).ThenInclude(x => x.CreatedByUser).SingleOrDefaultAsync(x => x.PaymentId == id, ct);
    private Task<Payment?> LockPayment(long id, CancellationToken ct) => db.Payments
        .FromSqlInterpolated($"SELECT * FROM [Payments] WITH (UPDLOCK, HOLDLOCK) WHERE [PaymentId] = {id}")
        .Include(x => x.Customer).Include(x => x.ReceivedByUser).Include(x => x.Allocations).ThenInclude(x => x.Invoice)
        .Include(x => x.Allocations).ThenInclude(x => x.CreatedByUser).SingleOrDefaultAsync(x => x.PaymentId == id, ct);
    private async Task<Customer?> ActiveCustomer(long id, CancellationToken ct) {
        var customer = await db.Customers.FromSqlInterpolated($"SELECT * FROM [Customers] WITH (UPDLOCK, HOLDLOCK) WHERE [CustomerId] = {id}").SingleOrDefaultAsync(ct);
        if (customer is not null) await db.Entry(customer).ReloadAsync(ct);
        return customer?.IsActive == true ? customer : null;
    }
    private async Task Save(Payment payment, string action, object? before, CancellationToken ct) {
        await db.SaveChangesAsync(ct);
        db.AuditLogs.Add(new AuditLog { UserId = actor.UserId, EntityName = "Payments",
            EntityId = payment.PaymentId.ToString(CultureInfo.InvariantCulture), Action = action,
            Description = JsonSerializer.Serialize(new { Before = before, After = Snapshot(payment) }) });
        await db.SaveChangesAsync(ct);
    }
    private static object Snapshot(Payment p) => new { p.PaymentNumber, p.CustomerId, p.PaymentDate,
        Amount = Money(p.Amount), p.PaymentMethod, p.ReferenceNumber, p.Status, p.ConfirmedAt,
        Allocations = p.Allocations.OrderBy(a => a.AllocationId).Select(a => new { a.AllocationId, a.InvoiceId,
            AllocatedAmount = Money(a.AllocatedAmount), a.AllocationDate, a.CreatedByUserId }).ToArray() };
    private static object View(Payment p) => new { p.PaymentId, p.PaymentNumber, p.CustomerId,
        customerCode = p.Customer.CustomerCode, customerName = p.Customer.CustomerName, p.ReceivedByUserId,
        receiverName = p.ReceivedByUser.FullName, p.PaymentDate, amount = Money(p.Amount), p.PaymentMethod,
        p.ReferenceNumber, p.Status, p.ConfirmedAt, p.RowVersion,
        allocatedAmount = Money(p.Allocations.Sum(a => a.AllocatedAmount)),
        unallocatedAmount = Money(p.Amount - p.Allocations.Sum(a => a.AllocatedAmount)),
        allocations = p.Allocations.OrderByDescending(a => a.AllocationId).Select(a => new { a.AllocationId, a.InvoiceId,
            a.Invoice.InvoiceNumber, allocatedAmount = Money(a.AllocatedAmount), a.AllocationDate, actorName = a.CreatedByUser.FullName }).ToArray() };
}
