using System.ComponentModel.DataAnnotations;
using LibraryManagement.Domain.Entities;

namespace LibraryManagement.Application.Books;

public sealed record BookCopyStatusUpdateDto
{
    [Required]
    [EnumDataType(typeof(BookCopyStatus))]
    public BookCopyStatus? Status { get; init; }
}
