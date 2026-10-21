using LibraryManagement.Application.Books;
using LibraryManagement.Domain.Entities;
using LibraryManagement.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace LibraryManagement.Infrastructure.Books;

public sealed class BookService(LibraryDbContext dbContext) : IBookService
{
    public async Task<PagedResult<BookDto>> GetBooksAsync(
        BookListQuery query,
        CancellationToken cancellationToken = default)
    {
        var booksQuery = dbContext.Books.AsNoTracking();
        var search = query.Search?.Trim();

        if (!string.IsNullOrEmpty(search))
        {
            booksQuery = booksQuery.Where(book =>
                book.Isbn.Contains(search)
                || book.Title.Contains(search)
                || book.Author.Contains(search)
                || book.Category.Contains(search));
        }

        var totalCount = await booksQuery.CountAsync(cancellationToken);
        var totalPages = (int)Math.Ceiling(totalCount / (double)query.PageSize);
        var offset = (long)(query.Page - 1) * query.PageSize;
        IReadOnlyList<BookDto> items;

        if (offset >= totalCount)
        {
            items = [];
        }
        else
        {
            items = await booksQuery
                .OrderBy(book => book.Title)
                .ThenBy(book => book.Id)
                .Skip((int)offset)
                .Take(query.PageSize)
                .Select(book => new BookDto(
                    book.Id,
                    book.Isbn,
                    book.Title,
                    book.Author,
                    book.Category,
                    book.Publisher,
                    book.PublicationYear,
                    book.ReplacementCost,
                    book.TotalCopies,
                    book.AvailableCopies))
                .ToListAsync(cancellationToken);
        }

        return new PagedResult<BookDto>(items, query.Page, query.PageSize, totalCount, totalPages);
    }

    public async Task<BookDto?> GetBookByIdAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        return await dbContext.Books
            .AsNoTracking()
            .Where(book => book.Id == id)
            .Select(book => new BookDto(
                book.Id,
                book.Isbn,
                book.Title,
                book.Author,
                book.Category,
                book.Publisher,
                book.PublicationYear,
                book.ReplacementCost,
                book.TotalCopies,
                book.AvailableCopies))
            .SingleOrDefaultAsync(cancellationToken);
    }

    public async Task<BookWriteResult> CreateBookAsync(
        BookWriteDto bookDto,
        CancellationToken cancellationToken = default)
    {
        var book = CreateBook(bookDto);

        if (await dbContext.Books.AnyAsync(
                existingBook => existingBook.Isbn == book.Isbn,
                cancellationToken))
        {
            return new BookWriteResult(BookWriteStatus.IsbnConflict);
        }

        dbContext.Books.Add(book);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            if (await dbContext.Books.AnyAsync(
                    existingBook => existingBook.Isbn == book.Isbn,
                    cancellationToken))
            {
                return new BookWriteResult(BookWriteStatus.IsbnConflict);
            }

            throw;
        }

        return new BookWriteResult(BookWriteStatus.Succeeded, ToDto(book));
    }

    public async Task<BookWriteResult> UpdateBookAsync(
        int id,
        BookWriteDto bookDto,
        CancellationToken cancellationToken = default)
    {
        var book = await dbContext.Books
            .SingleOrDefaultAsync(existingBook => existingBook.Id == id, cancellationToken);

        if (book is null)
        {
            return new BookWriteResult(BookWriteStatus.NotFound);
        }

        var isbn = Normalize(bookDto.Isbn);
        if (await dbContext.Books.AnyAsync(
                existingBook => existingBook.Id != id && existingBook.Isbn == isbn,
                cancellationToken))
        {
            return new BookWriteResult(BookWriteStatus.IsbnConflict);
        }

        UpdateBook(book, bookDto);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            if (await dbContext.Books.AnyAsync(
                    existingBook => existingBook.Id != id && existingBook.Isbn == isbn,
                    cancellationToken))
            {
                return new BookWriteResult(BookWriteStatus.IsbnConflict);
            }

            throw;
        }

        return new BookWriteResult(BookWriteStatus.Succeeded, ToDto(book));
    }

    public async Task<bool> DeleteBookAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        var book = await dbContext.Books
            .SingleOrDefaultAsync(existingBook => existingBook.Id == id, cancellationToken);

        if (book is null)
        {
            return false;
        }

        dbContext.Books.Remove(book);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static Book CreateBook(BookWriteDto bookDto)
    {
        var book = new Book();
        UpdateBook(book, bookDto);
        return book;
    }

    private static void UpdateBook(Book book, BookWriteDto bookDto)
    {
        book.Isbn = Normalize(bookDto.Isbn);
        book.Title = Normalize(bookDto.Title);
        book.Author = Normalize(bookDto.Author);
        book.Category = Normalize(bookDto.Category);
        book.Publisher = Normalize(bookDto.Publisher);
        book.PublicationYear = bookDto.PublicationYear;
        book.ReplacementCost = bookDto.ReplacementCost;
        book.TotalCopies = bookDto.TotalCopies;
        book.AvailableCopies = bookDto.AvailableCopies;
    }

    private static string Normalize(string value) => value.Trim();

    private static BookDto ToDto(Book book) => new(
        book.Id,
        book.Isbn,
        book.Title,
        book.Author,
        book.Category,
        book.Publisher,
        book.PublicationYear,
        book.ReplacementCost,
        book.TotalCopies,
        book.AvailableCopies);
}
