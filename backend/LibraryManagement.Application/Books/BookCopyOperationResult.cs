namespace LibraryManagement.Application.Books;

public enum BookCopyOperationStatus
{
    Succeeded,
    BookNotFound,
    CopyNotFound,
    InvalidStatus
}

public sealed record BookCopyOperationResult(
    BookCopyOperationStatus Status,
    BookCopyDto? Copy = null);
