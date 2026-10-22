using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LibraryManagement.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBookCopies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BookCopies",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    BookId = table.Column<int>(type: "int", nullable: false),
                    Barcode = table.Column<string>(type: "nvarchar(35)", maxLength: 35, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BookCopies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BookCopies_Books_BookId",
                        column: x => x.BookId,
                        principalTable: "Books",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BookCopies_Barcode",
                table: "BookCopies",
                column: "Barcode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BookCopies_BookId",
                table: "BookCopies",
                column: "BookId");

            migrationBuilder.Sql(
                """
                DECLARE @MaxCopies int = ISNULL((SELECT MAX(TotalCopies) FROM Books), 0);

                ;WITH CopyNumbers (CopyNumber) AS
                (
                    SELECT 1
                    UNION ALL
                    SELECT CopyNumber + 1
                    FROM CopyNumbers
                    WHERE CopyNumber < @MaxCopies
                )
                INSERT INTO BookCopies (BookId, Barcode, Status)
                SELECT
                    books.Id,
                    CONCAT(N'BC-', REPLACE(CONVERT(nvarchar(36), NEWID()), N'-', N'')),
                    0
                FROM Books AS books
                INNER JOIN CopyNumbers AS numbers ON numbers.CopyNumber <= books.TotalCopies
                OPTION (MAXRECURSION 0);
                """);

            migrationBuilder.DropColumn(
                name: "AvailableCopies",
                table: "Books");

            migrationBuilder.DropColumn(
                name: "TotalCopies",
                table: "Books");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AvailableCopies",
                table: "Books",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "TotalCopies",
                table: "Books",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql(
                """
                UPDATE Books
                SET TotalCopies = (
                        SELECT COUNT(*) FROM BookCopies WHERE BookCopies.BookId = Books.Id),
                    AvailableCopies = (
                        SELECT COUNT(*) FROM BookCopies
                        WHERE BookCopies.BookId = Books.Id AND BookCopies.Status = 0);
                """);

            migrationBuilder.DropTable(
                name: "BookCopies");
        }
    }
}
