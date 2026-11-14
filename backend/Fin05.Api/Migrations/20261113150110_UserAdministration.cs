using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fin05.Api.Migrations
{
    /// <inheritdoc />
    public partial class UserAdministration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AdminSyncPending",
                table: "AppUsers",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastAdminUpdate",
                table: "AppUsers",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ManagedRolesJson",
                table: "AppUsers",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ObservedRolesJson",
                table: "AppUsers",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "AppUsers",
                type: "rowversion",
                rowVersion: true,
                nullable: false,
                defaultValue: new byte[0]);

            migrationBuilder.AddColumn<string>(
                name: "Username",
                table: "AppUsers",
                type: "nvarchar(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "UserAdminOperations",
                columns: table => new
                {
                    OperationId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ActorUserId = table.Column<long>(type: "bigint", nullable: false),
                    TargetUserId = table.Column<long>(type: "bigint", nullable: true),
                    TargetSubject = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    TargetUsername = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    DesiredJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    LastError = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    StartedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserAdminOperations", x => x.OperationId);
                    table.CheckConstraint("CK_UserAdminOperations_Kind", "[Kind] IN ('Create','Update')");
                    table.CheckConstraint("CK_UserAdminOperations_State", "[Status] IN ('Pending','Completed','Failed')");
                    table.ForeignKey(
                        name: "FK_UserAdminOperations_AppUsers_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "AppUsers",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_UserAdminOperations_AppUsers_TargetUserId",
                        column: x => x.TargetUserId,
                        principalTable: "AppUsers",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserAdminOperations_ActorUserId",
                table: "UserAdminOperations",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserAdminOperations_TargetSubject_StartedAt",
                table: "UserAdminOperations",
                columns: new[] { "TargetSubject", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_UserAdminOperations_TargetUserId",
                table: "UserAdminOperations",
                column: "TargetUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserAdminOperations");

            migrationBuilder.DropColumn(
                name: "AdminSyncPending",
                table: "AppUsers");

            migrationBuilder.DropColumn(
                name: "LastAdminUpdate",
                table: "AppUsers");

            migrationBuilder.DropColumn(
                name: "ManagedRolesJson",
                table: "AppUsers");

            migrationBuilder.DropColumn(
                name: "ObservedRolesJson",
                table: "AppUsers");

            migrationBuilder.DropColumn(
                name: "RowVersion",
                table: "AppUsers");

            migrationBuilder.DropColumn(
                name: "Username",
                table: "AppUsers");
        }
    }
}
