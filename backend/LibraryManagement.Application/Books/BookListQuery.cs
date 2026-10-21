using System.ComponentModel.DataAnnotations;

namespace LibraryManagement.Application.Books;

public sealed record BookListQuery
{
    [Range(1, int.MaxValue)]
    public int Page { get; init; } = 1;

    [Range(1, 100)]
    public int PageSize { get; init; } = 20;

    [StringLength(100)]
    public string? Search { get; init; }
}
