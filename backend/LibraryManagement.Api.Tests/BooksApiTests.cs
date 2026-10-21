using System.Net;
using System.Net.Http.Json;
using LibraryManagement.Application.Books;
using Xunit;

namespace LibraryManagement.Api.Tests;

public sealed class BooksApiTests : IAsyncLifetime
{
    private LibraryApiFactory _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        _factory = new LibraryApiFactory();
        _client = _factory.CreateClient();
        await _factory.InitializeDatabaseAsync();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
    }

    [Fact]
    public async Task GetBooks_returns_empty_page_with_default_metadata()
    {
        var result = await _client.GetFromJsonAsync<PagedResult<BookDto>>("/api/books");

        Assert.NotNull(result);
        Assert.Empty(result.Items);
        Assert.Equal(1, result.Page);
        Assert.Equal(20, result.PageSize);
        Assert.Equal(0, result.TotalCount);
        Assert.Equal(0, result.TotalPages);
    }

    [Theory]
    [InlineData("ISBN-search")]
    [InlineData("Search Title")]
    [InlineData("Search Author")]
    [InlineData("Search Category")]
    public async Task GetBooks_filters_by_search_term(string search)
    {
        await CreateBookAsync(
            isbn: "ISBN-search",
            title: "Search Title",
            author: "Search Author",
            category: "Search Category");

        var result = await _client.GetFromJsonAsync<PagedResult<BookDto>>(
            $"/api/books?search={Uri.EscapeDataString(search)}");

        Assert.NotNull(result);
        Assert.Single(result.Items);
        Assert.Equal(1, result.TotalCount);
        Assert.Equal(1, result.TotalPages);
    }

    [Fact]
    public async Task GetBooks_trims_search_term()
    {
        await CreateBookAsync(title: "Search Title");

        var result = await _client.GetFromJsonAsync<PagedResult<BookDto>>(
            $"/api/books?search={Uri.EscapeDataString("  Search Title  ")}");

        Assert.NotNull(result);
        Assert.Single(result.Items);
    }

    [Fact]
    public async Task GetBooks_returns_requested_page_and_metadata()
    {
        for (var index = 1; index <= 5; index++)
        {
            await CreateBookAsync($"ISBN-{index}", $"Book {index}");
        }

        var result = await _client.GetFromJsonAsync<PagedResult<BookDto>>(
            "/api/books?page=2&pageSize=2");

        Assert.NotNull(result);
        Assert.Equal(2, result.Page);
        Assert.Equal(2, result.PageSize);
        Assert.Equal(5, result.TotalCount);
        Assert.Equal(3, result.TotalPages);
        Assert.Equal(new[] { "Book 3", "Book 4" }, result.Items.Select(book => book.Title));
    }

    [Fact]
    public async Task GetBooks_uses_default_page_size_and_reports_total_pages()
    {
        for (var index = 1; index <= 21; index++)
        {
            await CreateBookAsync($"ISBN-{index}", $"Book {index:D2}");
        }

        var result = await _client.GetFromJsonAsync<PagedResult<BookDto>>("/api/books");

        Assert.NotNull(result);
        Assert.Equal(20, result.Items.Count);
        Assert.Equal(20, result.PageSize);
        Assert.Equal(21, result.TotalCount);
        Assert.Equal(2, result.TotalPages);
    }

    [Fact]
    public async Task GetBooks_returns_empty_items_for_page_beyond_last_page()
    {
        await CreateBookAsync();

        var result = await _client.GetFromJsonAsync<PagedResult<BookDto>>(
            "/api/books?page=2147483647&pageSize=100");

        Assert.NotNull(result);
        Assert.Empty(result.Items);
        Assert.Equal(1, result.TotalCount);
    }

    [Theory]
    [InlineData("/api/books?page=0")]
    [InlineData("/api/books?pageSize=0")]
    [InlineData("/api/books?pageSize=101")]
    public async Task GetBooks_returns_bad_request_for_invalid_pagination(string requestUri)
    {
        var response = await _client.GetAsync(requestUri);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GetBooks_returns_bad_request_for_search_term_over_limit()
    {
        var search = Uri.EscapeDataString(new string('a', 101));

        var response = await _client.GetAsync($"/api/books?search={search}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GetBook_returns_not_found_for_unknown_id()
    {
        var response = await _client.GetAsync("/api/books/999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PostBook_returns_created_resource_and_location()
    {
        var response = await _client.PostAsJsonAsync("/api/books", ValidBook());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(response.Headers.Location);

        var createdBook = await response.Content.ReadFromJsonAsync<BookDto>();
        Assert.NotNull(createdBook);

        var getResponse = await _client.GetAsync(response.Headers.Location);
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);

        var fetchedBook = await getResponse.Content.ReadFromJsonAsync<BookDto>();
        Assert.Equal(createdBook, fetchedBook);
    }

    [Fact]
    public async Task PutBook_updates_existing_book()
    {
        var createdBook = await CreateBookAsync();
        var updatedBook = ValidBook(isbn: "9780000000002", title: "Updated Title");

        var response = await _client.PutAsJsonAsync($"/api/books/{createdBook.Id}", updatedBook);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<BookDto>();
        Assert.NotNull(result);
        Assert.Equal("Updated Title", result.Title);
        Assert.Equal("9780000000002", result.Isbn);
    }

    [Fact]
    public async Task PutBook_returns_not_found_for_unknown_id()
    {
        var response = await _client.PutAsJsonAsync("/api/books/999", ValidBook());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PostBook_returns_conflict_for_duplicate_isbn()
    {
        await CreateBookAsync();

        var response = await _client.PostAsJsonAsync("/api/books", ValidBook());

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task PutBook_returns_conflict_when_isbn_belongs_to_another_book()
    {
        await CreateBookAsync();
        var secondBook = await CreateBookAsync("9780000000002");

        var response = await _client.PutAsJsonAsync(
            $"/api/books/{secondBook.Id}",
            ValidBook());

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task PostBook_returns_bad_request_when_required_fields_are_missing()
    {
        var response = await _client.PostAsJsonAsync("/api/books", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PostBook_returns_bad_request_when_copy_counts_are_invalid()
    {
        var response = await _client.PostAsJsonAsync(
            "/api/books",
            ValidBook(totalCopies: 5, availableCopies: 6));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PostBook_returns_bad_request_when_total_copies_are_zero()
    {
        var response = await _client.PostAsJsonAsync(
            "/api/books",
            ValidBook(totalCopies: 0, availableCopies: 0));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PostBook_returns_bad_request_when_replacement_cost_is_zero()
    {
        var response = await _client.PostAsJsonAsync(
            "/api/books",
            ValidBook(replacementCost: 0));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task DeleteBook_returns_no_content_and_then_not_found()
    {
        var createdBook = await CreateBookAsync();

        var response = await _client.DeleteAsync($"/api/books/{createdBook.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var getResponse = await _client.GetAsync($"/api/books/{createdBook.Id}");
        Assert.Equal(HttpStatusCode.NotFound, getResponse.StatusCode);
    }

    [Fact]
    public async Task DeleteBook_returns_not_found_for_unknown_id()
    {
        var response = await _client.DeleteAsync("/api/books/999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private async Task<BookDto> CreateBookAsync(
        string isbn = "9780000000001",
        string title = "Test Book",
        string author = "Test Author",
        string category = "Fiction")
    {
        var response = await _client.PostAsJsonAsync(
            "/api/books",
            ValidBook(isbn, title, author: author, category: category));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<BookDto>())!;
    }

    private static object ValidBook(
        string isbn = "9780000000001",
        string title = "Test Book",
        decimal replacementCost = 19.99m,
        int totalCopies = 5,
        int availableCopies = 4,
        string author = "Test Author",
        string category = "Fiction") => new
    {
        isbn,
        title,
        author,
        category,
        publisher = "Test Publisher",
        publicationYear = 2020,
        replacementCost,
        totalCopies,
        availableCopies
    };
}
