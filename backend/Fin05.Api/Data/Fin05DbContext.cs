using Fin05.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Fin05.Api.Data;

public sealed class Fin05DbContext(DbContextOptions<Fin05DbContext> options) : DbContext(options)
{
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<AppUser> AppUsers => Set<AppUser>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceItem> InvoiceItems => Set<InvoiceItem>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentAllocation> PaymentAllocations => Set<PaymentAllocation>();
    public DbSet<DebtReminder> DebtReminders => Set<DebtReminder>();
    public DbSet<AccountingAccount> AccountingAccounts => Set<AccountingAccount>();
    public DbSet<DebtAdjustment> DebtAdjustments => Set<DebtAdjustment>();
    public DbSet<DebtAdjustmentLine> DebtAdjustmentLines => Set<DebtAdjustmentLine>();
    public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();
    public DbSet<JournalEntryLine> JournalEntryLines => Set<JournalEntryLine>();
    public DbSet<UserAdminOperation> UserAdminOperations => Set<UserAdminOperation>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        AdjustmentModel.Configure(modelBuilder);
        var customer = modelBuilder.Entity<Customer>();
        customer.ToTable("Customers");
        customer.HasKey(x => x.CustomerId);
        customer.Property(x => x.CustomerCode).HasMaxLength(30).IsRequired();
        customer.HasIndex(x => x.CustomerCode).IsUnique();
        customer.Property(x => x.CustomerName).HasMaxLength(200).IsRequired();
        customer.Property(x => x.TaxCode).HasMaxLength(30);
        customer.Property(x => x.Phone).HasMaxLength(20);
        customer.Property(x => x.Email).HasMaxLength(254);
        customer.Property(x => x.Address).HasMaxLength(500);
        customer.Property(x => x.CreatedAt).HasColumnType("datetime2")
            .HasConversion(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        customer.Property(x => x.RowVersion).IsRowVersion();

        var user = modelBuilder.Entity<AppUser>();
        user.ToTable("AppUsers");
        user.HasKey(x => x.UserId);
        user.Property(x => x.KeycloakSubject).HasMaxLength(64).IsRequired();
        user.HasIndex(x => x.KeycloakSubject).IsUnique();
        user.Property(x => x.FullName).HasMaxLength(150).IsRequired();
        user.Property(x => x.Email).HasMaxLength(254);
        user.Property(x => x.Username).HasMaxLength(150);
        user.Property(x => x.ManagedRolesJson).HasMaxLength(500);
        user.Property(x => x.ObservedRolesJson).HasMaxLength(500);
        user.Property(x => x.RowVersion).IsRowVersion();
        user.Property(x => x.LastAdminUpdate).HasColumnType("datetime2").HasConversion(v => v, v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v);
        user.Property(x => x.CreatedAt).HasColumnType("datetime2")
            .HasConversion(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));

        var audit = modelBuilder.Entity<AuditLog>();
        audit.ToTable("AuditLogs");
        audit.HasKey(x => x.AuditLogId);
        audit.Property(x => x.Action).HasMaxLength(100).IsRequired();
        audit.Property(x => x.EntityName).HasMaxLength(100).IsRequired();
        audit.Property(x => x.EntityId).HasMaxLength(64);
        audit.Property(x => x.Description).HasColumnType("nvarchar(max)");
        audit.Property(x => x.ActionTime).HasColumnType("datetime2")
            .HasConversion(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        audit.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        audit.HasIndex(x => new { x.EntityName, x.EntityId, x.ActionTime });

        var invoice = modelBuilder.Entity<Invoice>();
        invoice.ToTable("Invoices", table =>
        {
            table.HasCheckConstraint("CK_Invoices_IssueStatus", "[IssueStatus] IN ('Draft','Issued','Cancelled')");
            table.HasCheckConstraint("CK_Invoices_IssueFields", "([IssueStatus] = 'Issued' AND [InvoiceNumber] IS NOT NULL AND [IssuedAt] IS NOT NULL AND [TotalAmount] > 0) OR ([IssueStatus] IN ('Draft','Cancelled') AND [InvoiceNumber] IS NULL AND [IssuedAt] IS NULL)");
        });
        invoice.HasKey(x => x.InvoiceId);
        invoice.Property(x => x.InvoiceNumber).HasMaxLength(30);
        invoice.HasIndex(x => x.InvoiceNumber).IsUnique().HasFilter("[InvoiceNumber] IS NOT NULL");
        invoice.Property(x => x.InvoiceDate).HasColumnType("datetime2");
        invoice.Property(x => x.DueDate).HasColumnType("date");
        invoice.Property(x => x.TotalAmount).HasPrecision(18, 2);
        invoice.Property(x => x.IssueStatus).HasMaxLength(20).IsRequired();
        invoice.Property(x => x.IssuedAt).HasColumnType("datetime2");
        invoice.Property(x => x.RowVersion).IsRowVersion();
        invoice.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        invoice.HasOne(x => x.CreatedByUser).WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        invoice.HasIndex(x => new { x.IssueStatus, x.InvoiceDate });
        var item = modelBuilder.Entity<InvoiceItem>();
        item.ToTable("InvoiceItems");
        item.HasKey(x => x.InvoiceItemId);
        item.Property(x => x.Description).HasMaxLength(500).IsRequired();
        item.Property(x => x.Quantity).HasPrecision(18, 3);
        item.Property(x => x.UnitPrice).HasPrecision(18, 2);
        item.Property(x => x.LineAmount).HasPrecision(18, 2);
        item.HasOne(x => x.Invoice).WithMany(x => x.Items).HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Cascade);

        var payment = modelBuilder.Entity<Payment>();
        payment.ToTable("Payments", table => {
            table.HasCheckConstraint("CK_Payments_Amount", "[Amount] > 0");
            table.HasCheckConstraint("CK_Payments_Status", "([Status] = 'Draft' AND [ConfirmedAt] IS NULL) OR ([Status] = 'Confirmed' AND [ConfirmedAt] IS NOT NULL)");
            table.HasCheckConstraint("CK_Payments_Method", "[PaymentMethod] IN ('Cash','BankTransfer')");
        });
        payment.HasKey(x => x.PaymentId);
        payment.Property(x => x.PaymentNumber).HasMaxLength(30).IsRequired();
        payment.HasIndex(x => x.PaymentNumber).IsUnique();
        payment.Property(x => x.PaymentDate).HasColumnType("date");
        payment.Property(x => x.Amount).HasPrecision(18, 2);
        payment.Property(x => x.PaymentMethod).HasMaxLength(30).IsRequired();
        payment.Property(x => x.ReferenceNumber).HasMaxLength(100);
        payment.Property(x => x.Status).HasMaxLength(20).IsRequired();
        payment.Property(x => x.RowVersion).IsRowVersion();
        payment.Property(x => x.ConfirmedAt).HasColumnType("datetime2")
            .HasConversion(value => value, value => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : value);
        payment.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        payment.HasOne(x => x.ReceivedByUser).WithMany().HasForeignKey(x => x.ReceivedByUserId).OnDelete(DeleteBehavior.Restrict);
        payment.HasIndex(x => new { x.CustomerId, x.Status });
        var allocation = modelBuilder.Entity<PaymentAllocation>();
        allocation.ToTable("PaymentAllocations", table => table.HasCheckConstraint("CK_Allocations_Amount", "[AllocatedAmount] > 0"));
        allocation.HasKey(x => x.AllocationId);
        allocation.Property(x => x.AllocatedAmount).HasPrecision(18, 2);
        allocation.Property(x => x.AllocationDate).HasColumnType("datetime2")
            .HasConversion(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        allocation.HasOne(x => x.Payment).WithMany(x => x.Allocations).HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
        allocation.HasOne(x => x.Invoice).WithMany().HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        allocation.HasOne(x => x.CreatedByUser).WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);

        var reminder = modelBuilder.Entity<DebtReminder>();
        reminder.ToTable("DebtReminders", table => {
            table.HasCheckConstraint("CK_Reminders_Balance", "[BalanceAtCreation] > 0");
            table.HasCheckConstraint("CK_Reminders_Channel", "[ContactChannel] IN ('Phone','Email','Other')");
            table.HasCheckConstraint("CK_Reminders_State", "([Status] = 'Open' AND [ContactedAt] IS NULL AND [ContactNote] IS NULL AND [ClosedAt] IS NULL AND [CloseReason] IS NULL) OR ([Status] = 'Contacted' AND [ContactedAt] IS NOT NULL AND [ContactNote] IS NOT NULL AND [ClosedAt] IS NULL AND [CloseReason] IS NULL) OR ([Status] = 'Closed' AND [ClosedAt] IS NOT NULL AND [CloseReason] IS NOT NULL AND (([ContactedAt] IS NULL AND [ContactNote] IS NULL) OR ([ContactedAt] IS NOT NULL AND [ContactNote] IS NOT NULL)))");
        });
        reminder.HasKey(x => x.ReminderId);
        reminder.Property(x => x.Content).HasColumnType("nvarchar(max)").IsRequired();
        reminder.Property(x => x.ContactChannel).HasMaxLength(20).IsRequired();
        reminder.Property(x => x.ContactInfo).HasMaxLength(254).IsRequired();
        reminder.Property(x => x.ContactNote).HasMaxLength(1000);
        reminder.Property(x => x.CloseReason).HasMaxLength(1000);
        reminder.Property(x => x.Status).HasMaxLength(20).IsRequired();
        reminder.Property(x => x.ReminderDate).HasColumnType("datetime2")
            .HasConversion(v => v, v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
        reminder.Property(x => x.ContactedAt).HasColumnType("datetime2")
            .HasConversion(v => v, v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v);
        reminder.Property(x => x.ClosedAt).HasColumnType("datetime2")
            .HasConversion(v => v, v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v);
        reminder.Property(x => x.ScheduledDate).HasColumnType("date");
        reminder.Property(x => x.BalanceAtCreation).HasPrecision(18, 2);
        reminder.Property(x => x.RowVersion).IsRowVersion();
        reminder.HasOne(x => x.Invoice).WithMany().HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        reminder.HasOne(x => x.CreatedByUser).WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        reminder.HasIndex(x => x.InvoiceId).IsUnique().HasFilter("[Status] <> 'Closed'");
        reminder.HasIndex(x => new { x.Status, x.ScheduledDate });
        var operation = modelBuilder.Entity<UserAdminOperation>();
        operation.ToTable("UserAdminOperations", t => {
            t.HasCheckConstraint("CK_UserAdminOperations_State", "[Status] IN ('Pending','Completed','Failed')");
            t.HasCheckConstraint("CK_UserAdminOperations_Kind", "[Kind] IN ('Create','Update')");
        });
        operation.HasKey(x => x.OperationId);
        operation.Property(x => x.TargetSubject).HasMaxLength(64);
        operation.Property(x => x.TargetUsername).HasMaxLength(150).IsRequired();
        operation.Property(x => x.Kind).HasMaxLength(20).IsRequired();
        operation.Property(x => x.Status).HasMaxLength(20).IsRequired();
        operation.Property(x => x.LastError).HasMaxLength(500);
        operation.Property(x => x.DesiredJson).HasColumnType("nvarchar(max)").IsRequired();
        operation.Property(x => x.RowVersion).IsRowVersion();
        operation.Property(x => x.StartedAt).HasColumnType("datetime2").HasConversion(v => v, v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
        operation.Property(x => x.CompletedAt).HasColumnType("datetime2").HasConversion(v => v, v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v);
        operation.HasOne(x => x.ActorUser).WithMany().HasForeignKey(x => x.ActorUserId).OnDelete(DeleteBehavior.Restrict);
        operation.HasOne(x => x.TargetUser).WithMany().HasForeignKey(x => x.TargetUserId).OnDelete(DeleteBehavior.Restrict);
        operation.HasIndex(x => new { x.TargetSubject, x.StartedAt });
    }
}
