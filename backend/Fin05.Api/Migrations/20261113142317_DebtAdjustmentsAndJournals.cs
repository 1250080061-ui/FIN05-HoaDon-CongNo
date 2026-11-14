using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Fin05.Api.Migrations
{
    /// <inheritdoc />
    public partial class DebtAdjustmentsAndJournals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AccountingAccounts",
                columns: table => new
                {
                    AccountId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AccountCode = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    AccountName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    IsReceivable = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccountingAccounts", x => x.AccountId);
                });

            migrationBuilder.CreateTable(
                name: "DebtAdjustments",
                columns: table => new
                {
                    AdjustmentId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    InvoiceId = table.Column<long>(type: "bigint", nullable: false),
                    CreatedByUserId = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    AdjustmentDate = table.Column<DateOnly>(type: "date", nullable: false),
                    SignedAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    PostedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReversedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReversalReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DebtAdjustments", x => x.AdjustmentId);
                    table.CheckConstraint("CK_Adjustments_Amount", "[SignedAmount] <> 0");
                    table.CheckConstraint("CK_Adjustments_State", "([Status] = 'Draft' AND [PostedAt] IS NULL AND [ReversedAt] IS NULL AND [ReversalReason] IS NULL) OR ([Status] = 'Posted' AND [PostedAt] IS NOT NULL AND [ReversedAt] IS NULL AND [ReversalReason] IS NULL) OR ([Status] = 'Reversed' AND [PostedAt] IS NOT NULL AND [ReversedAt] IS NOT NULL AND [ReversalReason] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_DebtAdjustments_AppUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AppUsers",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DebtAdjustments_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "InvoiceId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "DebtAdjustmentLines",
                columns: table => new
                {
                    DebtAdjustmentLineId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AdjustmentId = table.Column<long>(type: "bigint", nullable: false),
                    AccountId = table.Column<long>(type: "bigint", nullable: false),
                    DebitAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreditAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DebtAdjustmentLines", x => x.DebtAdjustmentLineId);
                    table.CheckConstraint("CK_AdjustmentLines_Side", "([DebitAmount] > 0 AND [CreditAmount] = 0) OR ([CreditAmount] > 0 AND [DebitAmount] = 0)");
                    table.ForeignKey(
                        name: "FK_DebtAdjustmentLines_AccountingAccounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "AccountingAccounts",
                        principalColumn: "AccountId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DebtAdjustmentLines_DebtAdjustments_AdjustmentId",
                        column: x => x.AdjustmentId,
                        principalTable: "DebtAdjustments",
                        principalColumn: "AdjustmentId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "JournalEntries",
                columns: table => new
                {
                    JournalEntryId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AdjustmentId = table.Column<long>(type: "bigint", nullable: false),
                    EntryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PostedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EntryType = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    PostedByUserId = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JournalEntries", x => x.JournalEntryId);
                    table.CheckConstraint("CK_JournalEntries_Type", "[EntryType] IN ('Original','Reversal')");
                    table.ForeignKey(
                        name: "FK_JournalEntries_AppUsers_PostedByUserId",
                        column: x => x.PostedByUserId,
                        principalTable: "AppUsers",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_JournalEntries_DebtAdjustments_AdjustmentId",
                        column: x => x.AdjustmentId,
                        principalTable: "DebtAdjustments",
                        principalColumn: "AdjustmentId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "JournalEntryLines",
                columns: table => new
                {
                    JournalEntryLineId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    JournalEntryId = table.Column<long>(type: "bigint", nullable: false),
                    AccountId = table.Column<long>(type: "bigint", nullable: false),
                    DebitAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreditAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JournalEntryLines", x => x.JournalEntryLineId);
                    table.CheckConstraint("CK_JournalEntryLines_Side", "([DebitAmount] > 0 AND [CreditAmount] = 0) OR ([CreditAmount] > 0 AND [DebitAmount] = 0)");
                    table.ForeignKey(
                        name: "FK_JournalEntryLines_AccountingAccounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "AccountingAccounts",
                        principalColumn: "AccountId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_JournalEntryLines_JournalEntries_JournalEntryId",
                        column: x => x.JournalEntryId,
                        principalTable: "JournalEntries",
                        principalColumn: "JournalEntryId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "AccountingAccounts",
                columns: new[] { "AccountId", "AccountCode", "AccountName", "IsActive", "IsReceivable" },
                values: new object[,]
                {
                    { 1L, "AR", "Phải thu khách hàng (mô phỏng)", true, true },
                    { 2L, "ADJ", "Đối ứng điều chỉnh (mô phỏng)", true, false },
                    { 3L, "OTHER", "Đối ứng khác (mô phỏng)", true, false }
                });

            migrationBuilder.CreateIndex(
                name: "IX_AccountingAccounts_AccountCode",
                table: "AccountingAccounts",
                column: "AccountCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DebtAdjustmentLines_AccountId",
                table: "DebtAdjustmentLines",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_DebtAdjustmentLines_AdjustmentId",
                table: "DebtAdjustmentLines",
                column: "AdjustmentId");

            migrationBuilder.CreateIndex(
                name: "IX_DebtAdjustments_CreatedByUserId",
                table: "DebtAdjustments",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_DebtAdjustments_InvoiceId",
                table: "DebtAdjustments",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_JournalEntries_AdjustmentId_EntryType",
                table: "JournalEntries",
                columns: new[] { "AdjustmentId", "EntryType" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_JournalEntries_PostedByUserId",
                table: "JournalEntries",
                column: "PostedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_JournalEntryLines_AccountId",
                table: "JournalEntryLines",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_JournalEntryLines_JournalEntryId",
                table: "JournalEntryLines",
                column: "JournalEntryId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DebtAdjustmentLines");

            migrationBuilder.DropTable(
                name: "JournalEntryLines");

            migrationBuilder.DropTable(
                name: "AccountingAccounts");

            migrationBuilder.DropTable(
                name: "JournalEntries");

            migrationBuilder.DropTable(
                name: "DebtAdjustments");
        }
    }
}
