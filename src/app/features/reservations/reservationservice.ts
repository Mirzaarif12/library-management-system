import { DestroyRef, Service, afterNextRender, effect, signal, inject } from '@angular/core';
import type { Reservation } from '../../models/reservation';
import { BookService } from '../books/bookservice';
import { MemberService } from '../members/memberservice';
import { BorrowingService } from '../borrowings/borrowingservice';

const PICKUP_WINDOW_MS = 48 * 60 * 60 * 1000;

@Service()
export class ReservationService {
  private readonly storageReady = signal(false);
  private readonly bookService = inject(BookService);
  private readonly memberService = inject(MemberService);
  private readonly borrowingService = inject(BorrowingService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reservations = signal<Reservation[]>([]);

  constructor() {
    afterNextRender(() => {
        try {
        const saved = localStorage.getItem('library-reservations');

        if (saved) {
            const parsed: unknown = JSON.parse(saved);

            if (Array.isArray(parsed)) {
            this.reservations.set(parsed as Reservation[]);
            }
        }
        } catch {
        // Start with an empty list if saved reservations can't be read.
        } finally {
        this.storageReady.set(true);
        }

        this.expireReadyReservations();

        const timerId = window.setInterval(
        () => this.expireReadyReservations(),
        60_000,
        );

        this.destroyRef.onDestroy(() => window.clearInterval(timerId));
    });

    effect(() => {
        if (!this.storageReady()) return;

        try {
        localStorage.setItem(
            'library-reservations',
            JSON.stringify(this.reservations()),
        );
        } catch {
        // The browser may prevent localStorage from being used.
        }
    });
  }

// Request a reservation for a book.
  requestReservation(memberId: string, bookId: string): string | null {
    const member = this.memberService.members().find((item) => item.id === memberId);
    const book = this.bookService.books().find((item) => item.id === bookId);

    if (!member) return 'Member not found.';
    if (member.status !== 'active') return 'This member account is suspended.';
    if (!book) return 'Book not found.';

    const alreadyHasActiveHold = this.reservations().some(
        (reservation) =>
        reservation.memberId === memberId &&
        reservation.bookId === bookId &&
        (reservation.status === 'waiting' || reservation.status === 'ready'),
    );

    if (alreadyHasActiveHold) {
        return 'You already have an active reservation for this book.';
    }

    const nextNumber =
        this.reservations().reduce((largest, reservation) => {
        const match = /^RS-(\d+)$/.exec(reservation.id);
        return match ? Math.max(largest, Number(match[1])) : largest;
        }, 0) + 1;

    const newReservation: Reservation = {
        id: `RS-${String(nextNumber).padStart(3, '0')}`,
        memberId,
        bookId,
        requestedAt: new Date().toISOString(),
        status: 'waiting',
        readyAt: null,
        pickupDeadline: null,
        collectedAt: null,
    };

    this.reservations.update((reservations) => [
        ...reservations,
        newReservation,
    ]);

    return null;
 }

// Mark a reservation as ready for pickup. 
 markReadyForPickup(reservationId: string): string | null {
    const reservation = this.reservations().find(
        (item) => item.id === reservationId,
    );
    this.expireReadyReservations();

    if (!reservation) return 'Reservation not found.';
    if (reservation.status !== 'waiting') {
        return 'Only waiting reservations can be marked ready.';
    }

    const firstInQueue = this.reservations()
        .filter(
        (item) =>
            item.bookId === reservation.bookId && item.status === 'waiting',
        )
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))[0];

    if (firstInQueue?.id !== reservation.id) {
        return 'Mark the earliest waiting reservation ready first.';
    }

    const member = this.memberService.members().find(
        (item) => item.id === reservation.memberId,
    );
    if (!member || member.status !== 'active') {
        return 'This member is unavailable or suspended.';
    }

    const book = this.bookService.books().find(
        (item) => item.id === reservation.bookId,
    );
    if (!book) return 'Book not found.';

    const readyHoldsForBook = this.reservations().filter(
        (item) =>
        item.bookId === reservation.bookId && item.status === 'ready',
    ).length;

    if (book.availableCopies - readyHoldsForBook < 1) {
        return 'There is no unreserved copy available right now.';
    }

    const readyAt = new Date();
    const pickupDeadline = new Date(
        readyAt.getTime() + PICKUP_WINDOW_MS,
    );

    this.reservations.update((items) =>
        items.map((item) =>
        item.id === reservationId
            ? {
                ...item,
                status: 'ready',
                readyAt: readyAt.toISOString(),
                pickupDeadline: pickupDeadline.toISOString(),
            }
            : item,
        ),
    );

    return null;
 }

// Record that a reservation has been picked up and create a borrowing record.
 recordPickup(reservationId: string): string | null {
    const reservation = this.reservations().find(
        (item) => item.id === reservationId,
    );

    if (!reservation) return 'Reservation not found.';
    if (reservation.status !== 'ready') {
        return 'Only ready reservations can be picked up.';
    }
    if (!reservation.pickupDeadline) {
        return 'This reservation has no pickup deadline.';
    }

    if (Date.parse(reservation.pickupDeadline) <= Date.now()) {
        this.reservations.update((items) =>
        items.map((item) =>
            item.id === reservationId ? { ...item, status: 'expired' } : item,
        ),
        );
        return 'The pickup window has expired.';
    }

    const borrowingError = this.borrowingService.borrowBook(
        reservation.memberId,
        reservation.bookId,
    );

    if (borrowingError) return borrowingError;

    this.reservations.update((items) =>
        items.map((item) =>
        item.id === reservationId
            ? {
                ...item,
                status: 'collected',
                collectedAt: new Date().toISOString(),
            }
            : item,
        ),
    );

    return null;
 }

 expireReadyReservations(): void {
    const now = Date.now();

    const expiredIds = new Set(
        this.reservations()
        .filter(
            (item) =>
            item.status === 'ready' &&
            item.pickupDeadline !== null &&
            Date.parse(item.pickupDeadline) <= now,
        )
        .map((item) => item.id),
    );

    if (expiredIds.size === 0) return;

    this.reservations.update((items) =>
        items.map((item) =>
        expiredIds.has(item.id) ? { ...item, status: 'expired' } : item,
        ),
    );
 }

   cancelReservation(memberId: string, reservationId: string): string | null {
    const reservation = this.reservations().find(
      (item) => item.id === reservationId,
    );

    if (!reservation) return 'Reservation not found.';

    if (reservation.memberId !== memberId) {
      return 'You can only cancel your own reservation.';
    }

    if (reservation.status !== 'waiting' && reservation.status !== 'ready') {
      return 'Only active reservations can be cancelled.';
    }

    this.reservations.update((items) =>
      items.map((item) =>
        item.id === reservationId
          ? { ...item, status: 'cancelled' }
          : item,
      ),
    );

    return null;
  }
  
}