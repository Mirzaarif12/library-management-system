namespace LibraryManagement.Domain.Entities;

public sealed class Book
{
    public int Id { get; set; }
    public string Isbn { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Author { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Publisher { get; set; } = string.Empty;
    public int PublicationYear { get; set; }
    public decimal ReplacementCost { get; set; }
    public int TotalCopies { get; set; }
    public int AvailableCopies { get; set; }
}
