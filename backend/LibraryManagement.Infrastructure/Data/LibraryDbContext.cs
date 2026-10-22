using LibraryManagement.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace LibraryManagement.Infrastructure.Data;

public sealed class LibraryDbContext(DbContextOptions<LibraryDbContext> options)
    : DbContext(options)
{
    public DbSet<Book> Books => Set<Book>();
    public DbSet<BookCopy> BookCopies => Set<BookCopy>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Book>(entity =>
        {
            entity.HasKey(book => book.Id);
            entity.Property(book => book.Isbn).HasMaxLength(20).IsRequired();
            entity.HasIndex(book => book.Isbn).IsUnique();
            entity.Property(book => book.Title).HasMaxLength(200).IsRequired();
            entity.Property(book => book.Author).HasMaxLength(150).IsRequired();
            entity.Property(book => book.Category).HasMaxLength(100).IsRequired();
            entity.Property(book => book.Publisher).HasMaxLength(150).IsRequired();
            entity.Property(book => book.ReplacementCost).HasPrecision(10, 2);
            entity.HasMany(book => book.Copies)
                .WithOne(copy => copy.Book)
                .HasForeignKey(copy => copy.BookId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<BookCopy>(entity =>
        {
            entity.HasKey(copy => copy.Id);
            entity.Property(copy => copy.Barcode).HasMaxLength(35).IsRequired();
            entity.HasIndex(copy => copy.Barcode).IsUnique();
            entity.Property(copy => copy.Status).IsRequired();
        });
    }
}
