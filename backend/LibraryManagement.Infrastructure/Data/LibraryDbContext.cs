using LibraryManagement.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace LibraryManagement.Infrastructure.Data;

public sealed class LibraryDbContext(DbContextOptions<LibraryDbContext> options)
    : DbContext(options)
{
    public DbSet<Book> Books => Set<Book>();

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
        });
    }
}
