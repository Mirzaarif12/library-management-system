namespace LibraryManagement.Application.Books;

public interface IBookService
{
    Task<PagedResult<BookDto>> GetBooksAsync(
        BookListQuery query,
        CancellationToken cancellationToken = default);

    Task<BookDto?> GetBookByIdAsync(
        int id,
        CancellationToken cancellationToken = default);

    Task<BookWriteResult> CreateBookAsync(
        BookWriteDto book,
        CancellationToken cancellationToken = default);

    Task<BookWriteResult> UpdateBookAsync(
        int id,
        BookWriteDto book,
        CancellationToken cancellationToken = default);

    Task<bool> DeleteBookAsync(
        int id,
        CancellationToken cancellationToken = default);
}
