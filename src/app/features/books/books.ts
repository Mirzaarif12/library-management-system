import { Component, computed, inject, signal } from '@angular/core';
import type { Book } from '../../models/book';
import { AuthService } from '../auth/authservice';
import { BorrowingService } from '../borrowings/borrowingservice';
import { ReservationService } from '../reservations/reservationservice';
import { BookService } from './bookservice';
import type { InventoryAdjustmentReason } from '../../models/inventory-adjustment';
import { InventoryService } from './inventoryservice';
import { NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'app-books',
  imports: [NgOptimizedImage],
  templateUrl: './books.html',
  styleUrls: ['./books.css', './member-books.css'],
})
export class Books {
  private readonly bookService = inject(BookService);
  private readonly authService = inject(AuthService);
  private readonly borrowingService = inject(BorrowingService);
  private readonly reservationService = inject(ReservationService);
  private readonly inventoryService = inject(InventoryService);

  protected readonly searchText = signal('');
  protected readonly selectedCategory = signal('All');
  protected readonly availabilityFilter = signal<'all' | 'available' | 'unavailable'>('all');

  protected readonly isMember = computed(
    () => this.authService.currentUser()?.role === 'member',
  );

  protected readonly canManageBooks = computed(() => {
    const role = this.authService.currentUser()?.role;
    return role === 'admin' || role === 'staff';
  });

  protected readonly reservationError = signal('');
  protected readonly reservationSuccess = signal('');

  protected readonly categories = computed(() => [
    'All',
    ...new Set(this.bookService.books().map((book) => book.category)),
  ]);

  protected readonly filteredBooks = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const category = this.selectedCategory();
    const availability = this.availabilityFilter();

    return this.bookService.books().filter((book) => {
      const matchesSearch =
        !query ||
        `${book.title} ${book.author} ${book.category} ${book.isbn}`
          .toLowerCase()
          .includes(query);

      const matchesCategory =
        category === 'All' || book.category === category;
      const matchesAvailability =
        availability === 'all' ||
        (availability === 'available' && this.availableForReservation(book.id) > 0) ||
        (availability === 'unavailable' && this.availableForReservation(book.id) === 0);

      return matchesSearch && matchesCategory && matchesAvailability;
    });
  });

  protected readonly sortOrder = signal<
    'title-asc' | 'title-desc' | 'author-asc'
  >('title-asc');

  protected readonly viewMode = signal<'list' | 'grid'>('list');

  protected readonly visibleBooks = computed(() => {
    const books = [...this.filteredBooks()];
    const order = this.sortOrder();

    return books.sort((a, b) => {
      if (order === 'title-desc') {
        return b.title.localeCompare(a.title);
      }

      if (order === 'author-asc') {
        return a.author.localeCompare(b.author);
      }

      return a.title.localeCompare(b.title);
    });
  });

  protected readonly bookMetrics = computed(() => {
    const books = this.bookService.books();
    const loans = this.borrowingService.borrowings();
    const totalCopies = books.reduce(
      (total, book) => total + book.totalCopies,
      0,
    );
    const availableCopies = books.reduce(
      (total, book) => total + book.availableCopies,
      0,
    );
    const today = this.toDateString(new Date());

    return {
      titleCount: books.length,
      totalCopies,
      availableCopies,
      borrowedCopies: loans.filter((loan) => this.borrowingService.isActiveLoan(loan)).length,
      overdueLoans: loans.filter(
        (loan) => this.borrowingService.isActiveLoan(loan) && loan.dueAt < today,
      ).length,
    };
  });

  protected readonly newTitle = signal('');
  protected readonly newAuthor = signal('');
  protected readonly newCategory = signal('');
  protected readonly newIsbn = signal('');
  protected readonly newPublisher = signal('');
  protected readonly newPublicationYear = signal(new Date().getFullYear());
  protected readonly newTotalCopies = signal(1);
  protected readonly newAvailableCopies = signal(1);
  protected readonly formError = signal('');

  protected readonly showAddForm = signal(false);
  protected readonly selectedBookId = signal<string | null>(null);

  protected readInput(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected setSortOrder(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    if (value === 'title-desc' || value === 'author-asc') {
      this.sortOrder.set(value);
    } else {
      this.sortOrder.set('title-asc');
    }
  }

  protected setSearchText(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.searchText.set(target.value);
  }

  protected setSelectedCategory(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement) this.selectedCategory.set(target.value);
  }

  protected setAvailabilityFilter(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const value = target.value;
    this.availabilityFilter.set(
      value === 'available' || value === 'unavailable' ? value : 'all',
    );
  }

  protected openAddForm(): void {
    if (!this.canManageBooks()) return;

    this.resetForm();
    this.showAddForm.set(true);
  }

  protected closeAddForm(): void {
    if (!this.canManageBooks()) return;

    this.showAddForm.set(false);
    this.resetForm();
  }

  protected editBook(book: Book): void {
    if (!this.canManageBooks()) return;

    this.selectedBookId.set(book.id);
    this.newTitle.set(book.title);
    this.newAuthor.set(book.author);
    this.newCategory.set(book.category);
    this.newIsbn.set(book.isbn);
    this.newPublisher.set(book.publisher);
    this.newPublicationYear.set(book.publicationYear);
    this.newTotalCopies.set(book.totalCopies);
    this.newAvailableCopies.set(book.availableCopies);
    this.formError.set('');
    this.showAddForm.set(true);
    this.newReplacementPrice.set(book.replacementCost);
    this.newDescription.set(book.description ?? '');
    this.newCoverUrl.set(book.coverUrl ?? '');
  }

  protected saveBook(): void {
    if (!this.canManageBooks()) return;

    const title = this.newTitle().trim();
    const author = this.newAuthor().trim();
    const category = this.newCategory().trim() || 'Uncategorized';
    const isbn = this.newIsbn().trim();
    const publisher = this.newPublisher().trim();
    const publicationYear = this.newPublicationYear();
    const totalCopies = this.newTotalCopies();
    const availableCopies = this.newAvailableCopies();
    const selectedId = this.selectedBookId();
    const replacementCost = this.newReplacementPrice();
    const description = this.newDescription().trim();
    const coverUrl = this.newCoverUrl().trim();

    if (
      !title ||
      !author ||
      !isbn ||
      !publisher ||
      !Number.isInteger(publicationYear) ||
      publicationYear < 1000 ||
      publicationYear > 2100 ||
      !Number.isInteger(totalCopies) ||
      totalCopies < 1 ||
      !Number.isInteger(availableCopies) ||
      availableCopies < 0 ||
      !Number.isFinite(replacementCost) || 
      replacementCost < 0
    ) {
      this.formError.set('Please enter valid information in all required fields.');
      return;
    }

    const activeLoansForBook = selectedId
      ? this.borrowingService
          .borrowings()
          .filter(
            (loan) =>
              loan.bookId === selectedId && this.borrowingService.isActiveLoan(loan),
          ).length
      : 0;

    if (availableCopies + activeLoansForBook > totalCopies) {
      this.formError.set(
        `Total copies must cover the available copies and ${activeLoansForBook} active loan(s).`,
      );
      return;
    }

    this.formError.set('');

    this.bookService.books.update((books) => {
      if (selectedId) {
        return books.map((book) =>
          book.id === selectedId
            ? {
                ...book,
                title,
                author,
                category,
                isbn,
                publisher,
                publicationYear,
                replacementCost,
                description,
                coverUrl,
              }
            : book,
        );
      }

      const highestNumber = books.reduce((highest, book) => {
        const match = /^BK-(\d+)$/.exec(book.id);
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 0);

      return [
        ...books,
        {
          id: `BK-${String(highestNumber + 1).padStart(3, '0')}`,
          isbn,
          title,
          author,
          category,
          publisher,
          publicationYear,
          replacementCost,
          description,
          coverUrl,
          totalCopies,
          availableCopies,
        },
      ];
    });

    this.closeAddForm();
    this.searchText.set('');
    this.selectedCategory.set('All');
  }

  private resetForm(): void {
    this.selectedBookId.set(null);
    this.newTitle.set('');
    this.newAuthor.set('');
    this.newCategory.set('');
    this.newIsbn.set('');
    this.newPublisher.set('');
    this.newPublicationYear.set(new Date().getFullYear());
    this.newTotalCopies.set(1);
    this.newAvailableCopies.set(1);
    this.formError.set('');
    this.newReplacementPrice.set(0);
    this.newDescription.set('');
    this.newCoverUrl.set('');
  }

  protected deleteBook(book: Book): void {
    if (!this.canManageBooks()) return;

    const hasLoanHistory = this.borrowingService
      .borrowings()
      .some((loan) => loan.bookId === book.id);

    if (hasLoanHistory) {
      window.alert(
        `${book.title} has loan records. Keep it in the catalog so past history still shows correctly.`,
      );
      return;
    }

    const confirmed = window.confirm(
      `Remove "${book.title}" from the collection?`,
    );

    if (!confirmed) return;

    this.bookService.books.update((books) =>
      books.filter((item) => item.id !== book.id),
    );
  }

  protected availableForReservation(bookId: string): number {
    const book = this.bookService.books().find((item) => item.id === bookId);
    if (!book) return 0;

    const readyHolds = this.reservationService
      .reservations()
      .filter(
        (item) => item.bookId === bookId && item.status === 'ready',
      ).length;

    return Math.max(0, book.availableCopies - readyHolds);
  }

  protected memberReservationStatus(
    bookId: string,
  ): 'waiting' | 'ready' | null {
    const memberId = this.authService.currentUser()?.memberId;
    if (!memberId) return null;

    const reservation = this.reservationService.reservations().find(
      (item) =>
        item.memberId === memberId &&
        item.bookId === bookId &&
        (item.status === 'waiting' || item.status === 'ready'),
    );

    if (reservation?.status === 'waiting') return 'waiting';
    if (reservation?.status === 'ready') return 'ready';
    return null;
  }

  protected reserveBook(bookId: string): void {
    const memberId = this.authService.currentUser()?.memberId;

    if (!this.isMember() || !memberId) {
      this.reservationError.set(
        'Sign in with a member account to reserve a book.',
      );
      this.reservationSuccess.set('');
      return;
    }

    const error = this.reservationService.requestReservation(
      memberId,
      bookId,
    );

    this.reservationError.set(error ?? '');
    this.reservationSuccess.set(
      error ? '' : 'Your reservation request has been added to the queue.',
    );
  }

  private toDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  protected readonly newReplacementPrice = signal(0);

  protected readonly stockAdjustmentBookId = signal<string | null>(null);

  protected readonly adjustmentReason =
    signal<Exclude<InventoryAdjustmentReason, 'borrower-lost'>>('purchase');

  protected readonly adjustmentQuantity = signal(1);
  protected readonly adjustmentNote = signal('');
  protected readonly adjustmentError = signal('');
  protected readonly adjustmentFeedback = signal('');

  protected readonly inventoryAdjustments = computed(() =>
    [...this.inventoryService.adjustments()].sort((a, b) =>
      b.adjustedAt.localeCompare(a.adjustedAt),
    ),
  );

  protected openStockAdjustment(bookId: string): void {
    if (!this.canManageBooks()) return;

    this.stockAdjustmentBookId.set(bookId);
    this.adjustmentReason.set('purchase');
    this.adjustmentQuantity.set(1);
    this.adjustmentNote.set('');
    this.adjustmentError.set('');
    this.adjustmentFeedback.set('');
  }

  protected closeStockAdjustment(): void {
    this.stockAdjustmentBookId.set(null);
    this.adjustmentError.set('');
  }

  protected setAdjustmentReason(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    if (
      value === 'purchase' ||
      value === 'donation' ||
      value === 'missing' ||
      value === 'damaged'
    ) {
      this.adjustmentReason.set(value);
    }
  }

  protected recordStockAdjustment(): void {
    if (!this.canManageBooks()) return;

    const bookId = this.stockAdjustmentBookId();
    if (!bookId) return;

    const error = this.inventoryService.recordAdjustment({
      bookId,
      reason: this.adjustmentReason(),
      quantity: this.adjustmentQuantity(),
      note: this.adjustmentNote(),
    });

    if (error) {
      this.adjustmentError.set(error);
      return;
    }

    this.adjustmentFeedback.set('Stock adjustment recorded.');
    this.closeStockAdjustment();
  }

  protected bookTitle(bookId: string): string {
    return this.bookService.books().find((book) => book.id === bookId)?.title
      ?? 'Unknown book';
  }

  protected adjustmentReasonLabel(reason: InventoryAdjustmentReason): string {
    const labels: Record<InventoryAdjustmentReason, string> = {
      purchase: 'Purchase',
      donation: 'Donation',
      missing: 'Missing in library',
      damaged: 'Damaged',
      'borrower-lost': 'Lost by borrower',
      'repair-completed': 'Repair completed',
    };

    return labels[reason];
  }

  protected readonly newDescription = signal('');
  protected readonly newCoverUrl = signal('');

}
