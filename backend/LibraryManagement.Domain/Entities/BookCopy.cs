namespace LibraryManagement.Domain.Entities;

public sealed class BookCopy
{
    public int Id { get; set; }
    public int BookId { get; set; }
    public string Barcode { get; set; } = string.Empty;
    public BookCopyStatus Status { get; set; } = BookCopyStatus.Available;
    public Book? Book { get; set; }
}
