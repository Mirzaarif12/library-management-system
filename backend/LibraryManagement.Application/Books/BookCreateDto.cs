using System.ComponentModel.DataAnnotations;

namespace LibraryManagement.Application.Books;

public sealed record BookCreateDto : BookWriteDto
{
    [Range(0, 1000)]
    public int InitialCopies { get; init; }
}
