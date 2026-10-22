using LibraryManagement.Domain.Entities;

namespace LibraryManagement.Application.Books;

public sealed record BookCopyDto(
    int Id,
    int BookId,
    string Barcode,
    BookCopyStatus Status);
