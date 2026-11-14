using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fin05.Api.Migrations
{
    /// <inheritdoc />
    public partial class DebtReminders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DebtReminders",
                columns: table => new
                {
                    ReminderId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    InvoiceId = table.Column<long>(type: "bigint", nullable: false),
                    CreatedByUserId = table.Column<long>(type: "bigint", nullable: false),
                    ReminderDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ScheduledDate = table.Column<DateOnly>(type: "date", nullable: false),
                    BalanceAtCreation = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Content = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ContactChannel = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ContactInfo = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ContactedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ContactNote = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ClosedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CloseReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DebtReminders", x => x.ReminderId);
                    table.CheckConstraint("CK_Reminders_Balance", "[BalanceAtCreation] > 0");
                    table.CheckConstraint("CK_Reminders_Channel", "[ContactChannel] IN ('Phone','Email','Other')");
                    table.CheckConstraint("CK_Reminders_State", "([Status] = 'Open' AND [ContactedAt] IS NULL AND [ContactNote] IS NULL AND [ClosedAt] IS NULL AND [CloseReason] IS NULL) OR ([Status] = 'Contacted' AND [ContactedAt] IS NOT NULL AND [ContactNote] IS NOT NULL AND [ClosedAt] IS NULL AND [CloseReason] IS NULL) OR ([Status] = 'Closed' AND [ClosedAt] IS NOT NULL AND [CloseReason] IS NOT NULL AND (([ContactedAt] IS NULL AND [ContactNote] IS NULL) OR ([ContactedAt] IS NOT NULL AND [ContactNote] IS NOT NULL)))");
                    table.ForeignKey(
                        name: "FK_DebtReminders_AppUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AppUsers",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DebtReminders_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "InvoiceId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DebtReminders_CreatedByUserId",
                table: "DebtReminders",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_DebtReminders_InvoiceId",
                table: "DebtReminders",
                column: "InvoiceId",
                unique: true,
                filter: "[Status] <> 'Closed'");

            migrationBuilder.CreateIndex(
                name: "IX_DebtReminders_Status_ScheduledDate",
                table: "DebtReminders",
                columns: new[] { "Status", "ScheduledDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DebtReminders");
        }
    }
}
