# Library Management Backend

## Database migration (local development)

After pulling schema changes, apply migrations with:

`dotnet ef database update --project .\backend\LibraryManagement.Infrastructure\LibraryManagement.Infrastructure.csproj --startup-project .\backend\LibraryManagement.Api\LibraryManagement.Api.csproj`

## Current migration baseline

Expected applied migrations in `__EFMigrationsHistory`:
- `20261021035046_InitialCreate`
- `20261022031321_AddBookCopies`

## Book copy status transitions

`PUT /api/books/{bookId}/copies/{barcode}/status` enforces these borrow/return rules:
- Borrow: `Available` -> `OnLoan`
- Return: `OnLoan` -> `Available`

Invalid borrow/return transitions return `400 BadRequest`.
