import { Component, computed, inject, signal, DestroyRef, afterNextRender } from '@angular/core';
import { DatePipe, NgOptimizedImage } from '@angular/common';
import { AuthService } from '../../auth/authservice';
import { BookService } from '../../books/bookservice';
import { ReservationService } from '../../reservations/reservationservice';

@Component({
  imports: [DatePipe, NgOptimizedImage],
  selector: 'app-my-reservations',
  styleUrl: './my-reservations.css',
  templateUrl: './my-reservations.html',
})
export class MyReservations {
  private readonly authService = inject(AuthService);
  private readonly reservationService = inject(ReservationService);
  private readonly bookService = inject(BookService);
  protected readonly cancelError = signal('');
  protected readonly cancelSuccess = signal('');
  protected readonly search = signal('');
  protected readonly historyStatus = signal<'all' | 'collected' | 'cancelled' | 'expired'>('all');
  protected readonly page = signal(1);
  protected readonly pageSize = 5;
  protected readonly showHistory = signal(false);
  protected readonly currentTime = signal<number | null>(null);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly myReservations = computed(() => {
    const memberId = this.authService.currentUser()?.memberId;

    if (!memberId) return [];

    return this.reservationService
      .reservations()
      .filter((reservation) => reservation.memberId === memberId)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  });

  protected bookTitle(bookId: string): string {
    return (
      this.bookService.books().find((book) => book.id === bookId)?.title ??
      'Unknown book'
    );
  }

  protected bookAuthor(bookId: string): string {
    return this.bookService.books().find((book) => book.id === bookId)?.author ?? 'Unknown author';
  }

  protected bookCategory(bookId: string): string {
    return this.bookService.books().find((book) => book.id === bookId)?.category ?? 'Uncategorized';
  }

  protected bookCover(bookId: string): string | null {
    return this.bookService.books().find((book) => book.id === bookId)?.coverUrl || null;
  }

  protected cancelReservation(reservationId: string): void {
    const memberId = this.authService.currentUser()?.memberId;

    if (!memberId) return;

    const error = this.reservationService.cancelReservation(
      memberId,
      reservationId,
    );

    this.cancelError.set(error ?? '');
    this.cancelSuccess.set(error ? '' : 'Reservation cancelled.');
  }

  protected readonly activeReservations = computed(() =>
    this.myReservations().filter(
      (reservation) =>
        reservation.status === 'waiting' ||
        reservation.status === 'ready',
    ),
  );

  protected readonly reservationHistory = computed(() =>
    this.myReservations().filter(
      (reservation) =>
        reservation.status === 'collected' ||
        reservation.status === 'cancelled' ||
        reservation.status === 'expired',
    ),
  );

  protected readonly displayedReservations = computed(() =>
    this.showHistory()
      ? this.reservationHistory()
      : this.activeReservations(),
  );

  protected readonly readyCount = computed(() =>
    this.activeReservations().filter((reservation) => reservation.status === 'ready').length,
  );
  protected readonly waitingCount = computed(() =>
    this.activeReservations().filter((reservation) => reservation.status === 'waiting').length,
  );
  protected readonly filteredReservations = computed(() => {
    const query = this.search().trim().toLowerCase();
    const status = this.historyStatus();
    return this.displayedReservations().filter((reservation) =>
      (!this.showHistory() || status === 'all' || reservation.status === status) &&
      (!query || `${reservation.id} ${this.bookTitle(reservation.bookId)} ${this.bookAuthor(reservation.bookId)}`
        .toLowerCase().includes(query)),
    );
  });
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredReservations().length / this.pageSize)),
  );
  protected readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));
  protected readonly pageNumbers = computed(() => {
    const count = this.pageCount();
    const start = Math.max(1, Math.min(this.currentPage() - 2, count - 4));
    return Array.from({ length: Math.min(5, count - start + 1) }, (_, index) => start + index);
  });
  protected readonly visibleReservations = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredReservations().slice(start, start + this.pageSize);
  });
  protected readonly rangeStart = computed(() =>
    this.filteredReservations().length === 0 ? 0 : (this.currentPage() - 1) * this.pageSize + 1,
  );
  protected readonly rangeEnd = computed(() =>
    Math.min(this.currentPage() * this.pageSize, this.filteredReservations().length),
  );

  protected setView(history: boolean): void {
    this.showHistory.set(history);
    this.page.set(1);
  }

  protected setSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.search.set(target.value);
    this.page.set(1);
  }

  protected setHistoryStatus(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const value = target.value;
    this.historyStatus.set(
      value === 'collected' || value === 'cancelled' || value === 'expired' ? value : 'all',
    );
    this.page.set(1);
  }

  protected changePage(delta: number): void {
    this.page.set(Math.min(this.pageCount(), Math.max(1, this.currentPage() + delta)));
  }

  protected goToPage(page: number): void {
    this.page.set(Math.min(this.pageCount(), Math.max(1, page)));
  }

  constructor() {
    afterNextRender(() => {
      const updateClock = () => this.currentTime.set(Date.now());

      updateClock();
      const timerId = window.setInterval(updateClock, 1000);

      this.destroyRef.onDestroy(() => window.clearInterval(timerId));
    });
  }

  protected timeRemaining(deadline: string): string {
    const now = this.currentTime();

    if (now === null) return 'Calculating…';

    const secondsLeft = Math.max(
      0,
      Math.floor((Date.parse(deadline) - now) / 1000),
    );

    const hours = Math.floor(secondsLeft / 3600);
    const minutes = Math.floor((secondsLeft % 3600) / 60);
    const seconds = secondsLeft % 60;

    return `${hours}h ${minutes}m ${seconds}s`;
  }

  protected queuePosition(reservationId: string, bookId: string): number {
    const waitingQueue = this.reservationService
      .reservations()
      .filter(
        (reservation) =>
          reservation.bookId === bookId &&
          reservation.status === 'waiting',
      )
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));

    const index = waitingQueue.findIndex(
      (reservation) => reservation.id === reservationId,
    );

    return index === -1 ? 0 : index + 1;
  }
}
