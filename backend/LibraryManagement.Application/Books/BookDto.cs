namespace LibraryManagement.Application.Books;

public sealed record BookDto(
    int Id,
    string Isbn,
    string Title,
    string Author,
    string Category,
    string Publisher,
    int PublicationYear,
    decimal ReplacementCost,
    int TotalCopies,
    int AvailableCopies);
