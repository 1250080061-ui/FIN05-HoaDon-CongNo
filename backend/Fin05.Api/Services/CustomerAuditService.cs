using System.Globalization;
using System.Text.Json;
using Fin05.Api.Data;
using Fin05.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Fin05.Api.Services;

public sealed record CustomerSnapshot(string CustomerCode, string CustomerName, string? TaxCode,
    string? Phone, string? Email, string? Address, bool IsActive)
{
    public static CustomerSnapshot From(Customer customer) => new(customer.CustomerCode, customer.CustomerName,
        customer.TaxCode, customer.Phone, customer.Email, customer.Address, customer.IsActive);
}

public sealed class CustomerAuditService(Fin05DbContext db, CurrentAppUser actor)
{
    public async Task SaveAsync(Customer customer, string action, CustomerSnapshot? before, CancellationToken cancellationToken)
    {
        db.ChangeTracker.DetectChanges();
        if (db.Entry(customer).State == EntityState.Unchanged) return;
        // The identity key must be generated before the audit entry. Both saves belong to the same transaction.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        db.AuditLogs.Add(new AuditLog
        {
            UserId = actor.UserId, EntityName = "Customers",
            EntityId = customer.CustomerId.ToString(CultureInfo.InvariantCulture), Action = action,
            Description = JsonSerializer.Serialize(new { Before = before, After = CustomerSnapshot.From(customer) })
        });
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }
}
