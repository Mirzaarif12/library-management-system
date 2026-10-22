using LibraryManagement.Application.Books;
using Microsoft.AspNetCore.Mvc;

namespace LibraryManagement.Api.Controllers;

[ApiController]
[Route("api/books")]
public sealed class BooksController(IBookService bookService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<BookDto>>> GetBooks(
        [FromQuery] BookListQuery query,
        CancellationToken cancellationToken)
    {
        var books = await bookService.GetBooksAsync(query, cancellationToken);
        return Ok(books);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<BookDto>> GetBook(
        int id,
        CancellationToken cancellationToken)
    {
        var book = await bookService.GetBookByIdAsync(id, cancellationToken);
        return book is null ? NotFound() : Ok(book);
    }

    [HttpGet("{bookId:int}/copies")]
    public async Task<ActionResult<IReadOnlyList<BookCopyDto>>> GetBookCopies(
        int bookId,
        CancellationToken cancellationToken)
    {
        var copies = await bookService.GetBookCopiesAsync(bookId, cancellationToken);
        return copies is null ? NotFound() : Ok(copies);
    }

    [HttpPost]
    public async Task<ActionResult<BookDto>> CreateBook(
        BookCreateDto book,
        CancellationToken cancellationToken)
    {
        var result = await bookService.CreateBookAsync(book, cancellationToken);

        if (result.Status == BookWriteStatus.IsbnConflict)
        {
            return Conflict(new { message = "A book with this ISBN already exists." });
        }

        return CreatedAtAction(nameof(GetBook), new { id = result.Book!.Id }, result.Book);
    }

    [HttpPost("{bookId:int}/copies")]
    public async Task<ActionResult<BookCopyDto>> AddBookCopy(
        int bookId,
        CancellationToken cancellationToken)
    {
        var result = await bookService.AddBookCopyAsync(bookId, cancellationToken);

        if (result.Status == BookCopyOperationStatus.BookNotFound)
        {
            return NotFound();
        }

        return CreatedAtAction(nameof(GetBookCopies), new { bookId }, result.Copy);
    }

    [HttpPut("{bookId:int}/copies/{barcode}/status")]
    public async Task<ActionResult<BookCopyDto>> UpdateBookCopyStatus(
        int bookId,
        string barcode,
        BookCopyStatusUpdateDto statusUpdate,
        CancellationToken cancellationToken)
    {
        var result = await bookService.UpdateBookCopyStatusAsync(
            bookId,
            barcode,
            statusUpdate.Status!.Value,
            cancellationToken);

        if (result.Status == BookCopyOperationStatus.BookNotFound
            || result.Status == BookCopyOperationStatus.CopyNotFound)
        {
            return NotFound();
        }

        if (result.Status == BookCopyOperationStatus.InvalidStatus)
        {
            return BadRequest(new { message = "The requested copy status is invalid." });
        }

        return Ok(result.Copy);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<BookDto>> UpdateBook(
        int id,
        BookWriteDto book,
        CancellationToken cancellationToken)
    {
        var result = await bookService.UpdateBookAsync(id, book, cancellationToken);

        if (result.Status == BookWriteStatus.NotFound)
        {
            return NotFound();
        }

        if (result.Status == BookWriteStatus.IsbnConflict)
        {
            return Conflict(new { message = "A book with this ISBN already exists." });
        }

        return Ok(result.Book);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteBook(
        int id,
        CancellationToken cancellationToken)
    {
        var result = await bookService.DeleteBookAsync(id, cancellationToken);

        if (result == BookDeleteStatus.NotFound)
        {
            return NotFound();
        }

        if (result == BookDeleteStatus.CopiesExist)
        {
            return Conflict(new { message = "A book with inventory copies cannot be deleted." });
        }

        return NoContent();
    }
}
