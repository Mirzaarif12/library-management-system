namespace LibraryManagement.Application.Books;

public enum BookWriteStatus
{
    Succeeded,
    NotFound,
    IsbnConflict
}

public sealed record BookWriteResult(BookWriteStatus Status, BookDto? Book = null);
