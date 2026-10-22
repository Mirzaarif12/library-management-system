using LibraryManagement.Domain.Entities;

namespace LibraryManagement.Application.Books;

public interface IBookService
{
    Task<PagedResult<BookDto>> GetBooksAsync(
        BookListQuery query,
        CancellationToken cancellationToken = default);

    Task<BookDto?> GetBookByIdAsync(
        int id,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<BookCopyDto>?> GetBookCopiesAsync(
        int bookId,
        CancellationToken cancellationToken = default);

    Task<BookWriteResult> CreateBookAsync(
        BookCreateDto book,
        CancellationToken cancellationToken = default);

    Task<BookWriteResult> UpdateBookAsync(
        int id,
        BookWriteDto book,
        CancellationToken cancellationToken = default);

    Task<BookCopyOperationResult> AddBookCopyAsync(
        int bookId,
        CancellationToken cancellationToken = default);

    Task<BookCopyOperationResult> UpdateBookCopyStatusAsync(
        int bookId,
        string barcode,
        BookCopyStatus status,
        CancellationToken cancellationToken = default);

    Task<BookDeleteStatus> DeleteBookAsync(
        int id,
        CancellationToken cancellationToken = default);
}
