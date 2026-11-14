using Fin05.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Fin05.Api.Data;

internal static class AdjustmentModel
{
    public static void Configure(ModelBuilder model)
    {
        var account = model.Entity<AccountingAccount>();
        account.ToTable("AccountingAccounts"); account.HasKey(x => x.AccountId);
        account.Property(x => x.AccountCode).HasMaxLength(30).IsRequired();
        account.HasIndex(x => x.AccountCode).IsUnique();
        account.Property(x => x.AccountName).HasMaxLength(200).IsRequired();
        // Demonstration chart, deliberately not a statutory accounting/tax configuration.
        account.HasData(new AccountingAccount { AccountId = 1, AccountCode = "AR", AccountName = "Phải thu khách hàng (mô phỏng)", IsReceivable = true },
            new AccountingAccount { AccountId = 2, AccountCode = "ADJ", AccountName = "Đối ứng điều chỉnh (mô phỏng)" },
            new AccountingAccount { AccountId = 3, AccountCode = "OTHER", AccountName = "Đối ứng khác (mô phỏng)" });
        var adjustment = model.Entity<DebtAdjustment>();
        adjustment.ToTable("DebtAdjustments", t => {
            t.HasCheckConstraint("CK_Adjustments_Amount", "[SignedAmount] <> 0");
            t.HasCheckConstraint("CK_Adjustments_State", "([Status] = 'Draft' AND [PostedAt] IS NULL AND [ReversedAt] IS NULL AND [ReversalReason] IS NULL) OR ([Status] = 'Posted' AND [PostedAt] IS NOT NULL AND [ReversedAt] IS NULL AND [ReversalReason] IS NULL) OR ([Status] = 'Reversed' AND [PostedAt] IS NOT NULL AND [ReversedAt] IS NOT NULL AND [ReversalReason] IS NOT NULL)");
        });
        adjustment.HasKey(x => x.AdjustmentId);
        adjustment.Property(x => x.SignedAmount).HasPrecision(18, 2);
        adjustment.Property(x => x.Reason).HasMaxLength(500).IsRequired();
        adjustment.Property(x => x.ReversalReason).HasMaxLength(500);
        adjustment.Property(x => x.Status).HasMaxLength(20).IsRequired();
        adjustment.Property(x => x.AdjustmentDate).HasColumnType("date");
        adjustment.Property(x => x.CreatedAt).HasColumnType("datetime2").HasConversion(v => v, v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
        adjustment.Property(x => x.PostedAt).HasColumnType("datetime2").HasConversion(v => v, v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v);
        adjustment.Property(x => x.ReversedAt).HasColumnType("datetime2").HasConversion(v => v, v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v);
        adjustment.Property(x => x.RowVersion).IsRowVersion();
        adjustment.HasOne(x => x.Invoice).WithMany().HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        adjustment.HasOne(x => x.CreatedByUser).WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        var draftLine = model.Entity<DebtAdjustmentLine>();
        draftLine.ToTable("DebtAdjustmentLines", t => t.HasCheckConstraint("CK_AdjustmentLines_Side", "([DebitAmount] > 0 AND [CreditAmount] = 0) OR ([CreditAmount] > 0 AND [DebitAmount] = 0)"));
        draftLine.HasKey(x => x.DebtAdjustmentLineId);
        draftLine.Property(x => x.DebitAmount).HasPrecision(18, 2); draftLine.Property(x => x.CreditAmount).HasPrecision(18, 2);
        draftLine.HasOne(x => x.Adjustment).WithMany(x => x.Lines).HasForeignKey(x => x.AdjustmentId).OnDelete(DeleteBehavior.Restrict);
        draftLine.HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
        var entry = model.Entity<JournalEntry>();
        entry.ToTable("JournalEntries", t => t.HasCheckConstraint("CK_JournalEntries_Type", "[EntryType] IN ('Original','Reversal')"));
        entry.HasKey(x => x.JournalEntryId);
        entry.HasIndex(x => new { x.AdjustmentId, x.EntryType }).IsUnique();
        entry.Property(x => x.EntryType).HasMaxLength(20).IsRequired();
        entry.Property(x => x.Description).HasMaxLength(500).IsRequired();
        entry.Property(x => x.EntryDate).HasColumnType("date");
        entry.Property(x => x.PostedAt).HasColumnType("datetime2").HasConversion(v => v, v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
        entry.HasOne(x => x.Adjustment).WithMany(x => x.JournalEntries).HasForeignKey(x => x.AdjustmentId).OnDelete(DeleteBehavior.Restrict);
        entry.HasOne(x => x.PostedByUser).WithMany().HasForeignKey(x => x.PostedByUserId).OnDelete(DeleteBehavior.Restrict);
        var line = model.Entity<JournalEntryLine>();
        line.ToTable("JournalEntryLines", t => t.HasCheckConstraint("CK_JournalEntryLines_Side", "([DebitAmount] > 0 AND [CreditAmount] = 0) OR ([CreditAmount] > 0 AND [DebitAmount] = 0)"));
        line.HasKey(x => x.JournalEntryLineId);
        line.Property(x => x.DebitAmount).HasPrecision(18, 2); line.Property(x => x.CreditAmount).HasPrecision(18, 2);
        line.HasOne(x => x.JournalEntry).WithMany(x => x.Lines).HasForeignKey(x => x.JournalEntryId).OnDelete(DeleteBehavior.Restrict);
        line.HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
    }
}
