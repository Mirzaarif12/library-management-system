# Next Feature Slice: Borrow/Return Workflow

## Goal
Enable borrowing and returning a book copy using the existing copy-status model, with clear API behavior and regression tests.

## Scope (small slice)
- Reuse existing endpoint: `PUT /api/books/{bookId}/copies/{barcode}/status`
- Borrow action = set status to `OnLoan`
- Return action = set status to `Available`
- Keep current statuses (`Missing`, `Damaged`) unchanged

## Acceptance Criteria
1. Borrowing an `Available` copy sets status to `OnLoan` and decreases `AvailableCopies` by 1.
2. Returning an `OnLoan` copy sets status to `Available` and increases `AvailableCopies` by 1.
3. Borrowing a copy that is not `Available` returns `400 BadRequest`.
4. Returning a copy that is not `OnLoan` returns `400 BadRequest`.
5. List and detail endpoints reflect updated counts immediately.

## Test-First Tasks
1. Add API test: borrow available copy updates status and counts.
2. Add API test: return on-loan copy updates status and counts.
3. Add API test: borrow unavailable copy returns bad request.
4. Add API test: return non-loan copy returns bad request.

## Implementation Tasks
1. Add transition-rule validation in `BookService.UpdateBookCopyStatusAsync`.
2. Preserve existing not-found behavior for unknown book/copy.
3. Return `InvalidStatus` result for invalid transitions.
4. Keep response shape unchanged (`BookCopyDto`).

## Files to Touch
- `backend/LibraryManagement.Api.Tests/BooksApiTests.cs`
- `backend/LibraryManagement.Infrastructure/Books/BookService.cs`
- (Optional, if needed) `backend/LibraryManagement.Application/Books/BookCopyOperationResult.cs`

## Out of Scope
- Borrower/member entity
- Loan history/audit table
- Due dates/fines/reservations
