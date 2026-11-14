using System.ComponentModel.DataAnnotations;
using Fin05.Api.Contracts;
using Fin05.Api.Data;
using Fin05.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Fin05.Api.Services;

namespace Fin05.Api.Controllers;

[ApiController]
[Authorize(Policy = "Customers.Read")]
[Route("api/customers")]
public sealed class CustomersController(Fin05DbContext db, CustomerAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, 100)] int pageSize = 20,
        [FromQuery, StringLength(200)] string? search = null,
        [FromQuery] bool? isActive = null,
        CancellationToken cancellationToken = default)
    {
        if ((long)(page - 1) * pageSize > int.MaxValue)
            return Problem(statusCode: 400, title: "Số trang vượt phạm vi hỗ trợ.");
        var query = db.Customers.AsNoTracking();
        if (isActive.HasValue) query = query.Where(x => x.IsActive == isActive.Value);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.CustomerCode.Contains(term) || x.CustomerName.Contains(term));
        }
        var total = await query.CountAsync(cancellationToken);
        var items = await query.OrderBy(x => x.CustomerCode).ThenBy(x => x.CustomerId)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        return Ok(new { items, total, page, pageSize });
    }

    [HttpGet("{id:long:min(1)}")]
    public async Task<IActionResult> GetById(long id, CancellationToken cancellationToken)
    {
        var customer = await db.Customers.AsNoTracking().SingleOrDefaultAsync(x => x.CustomerId == id, cancellationToken);
        return customer is null ? Problem(statusCode: 404, title: "Không tìm thấy khách hàng.") : Ok(customer);
    }

    [HttpPost]
    [Authorize(Policy = "Customers.Write")]
    public async Task<IActionResult> Create(CreateCustomerRequest request, CancellationToken cancellationToken)
    {
        var code = request.CustomerCode.Trim().ToUpperInvariant();
        if (await db.Customers.AnyAsync(x => x.CustomerCode == code, cancellationToken)) return DuplicateCode();
        var customer = new Customer
        {
            CustomerCode = code, CustomerName = request.CustomerName.Trim(),
            TaxCode = Optional(request.TaxCode), Phone = Optional(request.Phone),
            Email = Optional(request.Email), Address = Optional(request.Address)
        };
        db.Customers.Add(customer);
        try { await audit.SaveAsync(customer, "Customer.Create", null, cancellationToken); }
        // The unique index also covers simultaneous requests with the same code.
        catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 })
        { return DuplicateCode(); }
        return CreatedAtAction(nameof(GetById), new { id = customer.CustomerId }, customer);
    }
    [HttpPut("{id:long:min(1)}")]
    [Authorize(Policy = "Customers.Write")]
    public async Task<IActionResult> Update(long id, UpdateCustomerRequest request, CancellationToken cancellationToken)
    {
        var customer = await db.Customers.SingleOrDefaultAsync(x => x.CustomerId == id, cancellationToken);
        if (customer is null) return Problem(statusCode: 404, title: "Không tìm thấy khách hàng.");
        if (!customer.RowVersion.AsSpan().SequenceEqual(request.RowVersion)) return StaleRecord();
        var before = CustomerSnapshot.From(customer);
        var code = request.CustomerCode.Trim().ToUpperInvariant();
        if (await db.Customers.AnyAsync(x => x.CustomerId != id && x.CustomerCode == code, cancellationToken))
            return DuplicateCode();
        customer.CustomerCode = code;
        customer.CustomerName = request.CustomerName.Trim();
        customer.TaxCode = Optional(request.TaxCode);
        customer.Phone = Optional(request.Phone);
        customer.Email = Optional(request.Email);
        customer.Address = Optional(request.Address);
        try { await audit.SaveAsync(customer, "Customer.Update", before, cancellationToken); }
        catch (DbUpdateConcurrencyException) { return StaleRecord(); }
        catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 })
        { return DuplicateCode(); }
        return Ok(customer);
    }

    [HttpPatch("{id:long:min(1)}/status")]
    [Authorize(Policy = "Customers.Write")]
    public async Task<IActionResult> ChangeStatus(long id, ChangeCustomerStatusRequest request, CancellationToken cancellationToken)
    {
        var customer = await db.Customers.SingleOrDefaultAsync(x => x.CustomerId == id, cancellationToken);
        if (customer is null) return Problem(statusCode: 404, title: "Không tìm thấy khách hàng.");
        if (!customer.RowVersion.AsSpan().SequenceEqual(request.RowVersion)) return StaleRecord();
        var before = CustomerSnapshot.From(customer);
        customer.IsActive = request.IsActive!.Value;
        try { await audit.SaveAsync(customer, customer.IsActive ? "Customer.Activate" : "Customer.Deactivate", before, cancellationToken); }
        catch (DbUpdateConcurrencyException) { return StaleRecord(); }
        return Ok(customer);
    }

    [HttpGet("{id:long:min(1)}/audit")]
    [Authorize(Policy = "Customers.Write")]
    public async Task<IActionResult> History(long id,
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, 100)] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if ((long)(page - 1) * pageSize > int.MaxValue)
            return Problem(statusCode: 400, title: "Số trang vượt phạm vi hỗ trợ.");
        if (!await db.Customers.AnyAsync(x => x.CustomerId == id, cancellationToken))
            return Problem(statusCode: 404, title: "Không tìm thấy khách hàng.");
        var entityId = id.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var query = db.AuditLogs.AsNoTracking().Where(x => x.EntityName == "Customers" && x.EntityId == entityId);
        var total = await query.CountAsync(cancellationToken);
        var items = await query.OrderByDescending(x => x.ActionTime).ThenByDescending(x => x.AuditLogId)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { x.AuditLogId, x.Action, x.ActionTime, x.UserId,
                actorName = x.User != null ? x.User.FullName : "Hệ thống", x.Description })
            .ToListAsync(cancellationToken);
        return Ok(new { items, total, page, pageSize });
    }

    private ObjectResult StaleRecord() => Problem(statusCode: 409,
        title: "Hồ sơ đã được thay đổi ở nơi khác. Đóng cửa sổ này, tải lại danh sách rồi mở hồ sơ để cập nhật.");
    private ObjectResult DuplicateCode() => Problem(statusCode: 409, title: "Mã khách hàng đã tồn tại.");
    private static string? Optional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
