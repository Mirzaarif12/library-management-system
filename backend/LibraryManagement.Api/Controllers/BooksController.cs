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

    [HttpPost]
    public async Task<ActionResult<BookDto>> CreateBook(
        BookWriteDto book,
        CancellationToken cancellationToken)
    {
        var result = await bookService.CreateBookAsync(book, cancellationToken);

        if (result.Status == BookWriteStatus.IsbnConflict)
        {
            return Conflict(new { message = "A book with this ISBN already exists." });
        }

        return CreatedAtAction(nameof(GetBook), new { id = result.Book!.Id }, result.Book);
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
        var deleted = await bookService.DeleteBookAsync(id, cancellationToken);
        return deleted ? NoContent() : NotFound();
    }
}
