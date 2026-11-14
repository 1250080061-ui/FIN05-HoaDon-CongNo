using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fin05.Api.Migrations
{
    /// <inheritdoc />
    public partial class InvoiceIssueRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddCheckConstraint(
                name: "CK_Invoices_IssueFields",
                table: "Invoices",
                sql: "([IssueStatus] = 'Issued' AND [InvoiceNumber] IS NOT NULL AND [IssuedAt] IS NOT NULL AND [TotalAmount] > 0) OR ([IssueStatus] IN ('Draft','Cancelled') AND [InvoiceNumber] IS NULL AND [IssuedAt] IS NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Invoices_IssueFields",
                table: "Invoices");
        }
    }
}
