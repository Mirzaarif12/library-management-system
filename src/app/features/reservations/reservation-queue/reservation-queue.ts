import { DatePipe, NgOptimizedImage } from '@angular/common';
import { Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { ReservationService } from '../reservationservice';
import { BookService } from '../../books/bookservice';
import { MemberService } from '../../members/memberservice';
import { BorrowingService } from '../../borrowings/borrowingservice';
import type { ReservationStatus } from '../../../models/reservation';

@Component({
  imports: [DatePipe, NgOptimizedImage],
  selector: 'app-reservation-queue',
  styleUrl: './reservation-queue.css',
  templateUrl: './reservation-queue.html',
})
export class ReservationQueue {
  private readonly reservationService = inject(ReservationService);
  private readonly bookService = inject(BookService);
  private readonly memberService = inject(MemberService);
  private readonly borrowingService = inject(BorrowingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly nowMs = signal(Date.now());
  protected readonly search = signal('');
  protected readonly statusFilter = signal<'all' | 'waiting' | 'ready' | 'expired'>('all');
  protected readonly sortOrder = signal<'priority' | 'oldest' | 'newest'>('priority');
  protected readonly filterPanelOpen = signal(false);
  protected readonly page = signal(1);
  protected readonly pageSize = 3;

  constructor() {
    afterNextRender(() => {
      const timerId = window.setInterval(() => this.nowMs.set(Date.now()), 60_000);
      this.destroyRef.onDestroy(() => window.clearInterval(timerId));
    });
  }

  protected readonly queueReservations = computed(() =>
    this.reservationService
      .reservations()
      .filter(
        (reservation) =>
          reservation.status === 'waiting' ||
          reservation.status === 'ready' ||
          reservation.status === 'expired',
      ),
  );

  protected readonly readyCount = computed(() =>
    this.queueReservations().filter((reservation) => reservation.status === 'ready').length,
  );
  protected readonly waitingCount = computed(() =>
    this.queueReservations().filter((reservation) => reservation.status === 'waiting').length,
  );
  protected readonly expiredCount = computed(() =>
    this.queueReservations().filter((reservation) => reservation.status === 'expired').length,
  );
  protected readonly filteredReservations = computed(() => {
    const query = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const order = this.sortOrder();
    const priority: Record<ReservationStatus, number> = {
      ready: 0,
      waiting: 1,
      expired: 2,
      collected: 3,
      cancelled: 4,
    };

    return this.queueReservations()
      .filter((reservation) =>
        (status === 'all' || reservation.status === status) &&
        (!query || `${reservation.id} ${this.bookTitle(reservation.bookId)} ${this.memberName(reservation.memberId)}`
          .toLowerCase().includes(query)),
      )
      .sort((a, b) => {
        if (order === 'newest') return b.requestedAt.localeCompare(a.requestedAt);
        if (order === 'oldest') return a.requestedAt.localeCompare(b.requestedAt);
        const statusOrder = priority[a.status] - priority[b.status];
        return statusOrder || a.requestedAt.localeCompare(b.requestedAt);
      });
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

  protected setSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.search.set(target.value);
    this.page.set(1);
  }

  protected setStatusFilter(status: 'all' | 'waiting' | 'ready' | 'expired'): void {
    this.statusFilter.set(status);
    this.page.set(1);
  }

  protected setStatusFromSelect(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const value = target.value;
    this.setStatusFilter(
      value === 'waiting' || value === 'ready' || value === 'expired' ? value : 'all',
    );
  }

  protected setSortOrder(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const value = target.value;
    this.sortOrder.set(value === 'oldest' || value === 'newest' ? value : 'priority');
    this.page.set(1);
  }

  protected changePage(delta: number): void {
    this.page.set(Math.min(this.pageCount(), Math.max(1, this.currentPage() + delta)));
  }

  protected goToPage(page: number): void {
    this.page.set(Math.min(this.pageCount(), Math.max(1, page)));
  }

  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');

  protected bookTitle(bookId: string): string {
    return (
      this.bookService.books().find((book) => book.id === bookId)?.title ??
      'Book not found'
    );
  }

  protected memberName(memberId: string): string {
    return (
      this.memberService.members().find((member) => member.id === memberId)
        ?.name ?? 'Member not found'
    );
  }

  protected memberInitial(memberId: string): string {
    return this.memberName(memberId).trim().charAt(0).toUpperCase() || '?';
  }

  protected bookCategory(bookId: string): string {
    return this.bookService.books().find((book) => book.id === bookId)?.category ?? 'Uncategorized';
  }

  protected bookCover(bookId: string): string | null {
    return this.bookService.books().find((book) => book.id === bookId)?.coverUrl || null;
  }

  protected waitingCountForBook(bookId: string): number {
    return this.reservationService.reservations().filter(
      (reservation) => reservation.bookId === bookId && reservation.status === 'waiting',
    ).length;
  }

  protected estimatedAvailability(bookId: string): string | null {
    const now = new Date(this.nowMs());
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dueDates = this.borrowingService.borrowings()
      .filter((loan) => loan.bookId === bookId && this.borrowingService.isActiveLoan(loan))
      .map((loan) => loan.dueAt)
      .filter((dueAt) => dueAt >= today)
      .sort();
    return dueDates[0] ?? null;
  }

  protected timeUntilDeadline(deadline: string | null): string {
    if (!deadline) return 'Not set';
    const milliseconds = Date.parse(deadline) - this.nowMs();
    if (milliseconds <= 0) return 'Expired';
    const hours = Math.ceil(milliseconds / 3_600_000);
    if (hours >= 24) {
      const days = Math.ceil(hours / 24);
      return `${days} ${days === 1 ? 'day' : 'days'}`;
    }
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  protected markReady(reservationId: string): void {
    const error = this.reservationService.markReadyForPickup(reservationId);
    this.showResult(error, 'Marked ready. The 48-hour pickup window has started.');
  }

  protected recordPickup(reservationId: string): void {
    const error = this.reservationService.recordPickup(reservationId);
    this.showResult(error, 'Pickup recorded and borrowing created.');
  }

  private showResult(error: string | null, success: string): void {
    this.errorMessage.set(error ?? '');
    this.successMessage.set(error ? '' : success);
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

  protected canMarkReady(reservationId: string, bookId: string): boolean {
    if (this.queuePosition(reservationId, bookId) !== 1) return false;

    const book = this.bookService.books().find((item) => item.id === bookId);
    if (!book) return false;

    const readyHolds = this.reservationService.reservations().filter(
      (reservation) =>
        reservation.bookId === bookId && reservation.status === 'ready',
    ).length;

    return book.availableCopies > readyHolds;
  }
}
