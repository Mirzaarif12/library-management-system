import { Service, afterNextRender, effect, inject, signal } from '@angular/core';
import type { InventoryAdjustment, InventoryAdjustmentReason } from '../../models/inventory-adjustment';
import { AuthService } from '../auth/authservice';
import { BookService } from './bookservice';
import type { DamageSeverity } from '../../models/borrowing';

interface AdjustmentRequest {
  bookId: string;
  reason: InventoryAdjustmentReason;
  quantity: number;
  note: string;
  borrowingId?: string;
  memberId?: string;
  damageSeverity?: DamageSeverity;
  borrowerResponsible?: boolean;
}

@Service()
export class InventoryService {
  private readonly authService = inject(AuthService);
  private readonly bookService = inject(BookService);
  private readonly storageReady = signal(false);

  readonly adjustments = signal<InventoryAdjustment[]>([]);

  constructor() {
    afterNextRender(() => {
      try {
        const saved = localStorage.getItem('library-inventory-adjustments');

        if (saved) {
          const parsed: unknown = JSON.parse(saved);

          if (Array.isArray(parsed)) {
            this.adjustments.set(parsed as InventoryAdjustment[]);
          }
        }
      } catch {
        // Keep an empty adjustment history if saved data cannot be read.
      } finally {
        this.storageReady.set(true);
      }
    });

    effect(() => {
      if (!this.storageReady()) return;

      localStorage.setItem(
        'library-inventory-adjustments',
        JSON.stringify(this.adjustments()),
      );
    });
  }

  recordAdjustment(request: AdjustmentRequest): string | null {
    const user = this.authService.currentUser();

    if (!user || (user.role !== 'admin' && user.role !== 'staff')) {
      return 'Only staff can adjust inventory.';
    }

    if (!Number.isInteger(request.quantity) || request.quantity < 1) {
      return 'Quantity must be a whole number greater than zero.';
    }

    if (!request.note.trim()) {
      return 'Enter a note explaining this adjustment.';
    }

    const book = this.bookService
      .books()
      .find((item) => item.id === request.bookId);

    if (!book) return 'Book not found.';

    let totalCopiesChange = 0;
    let availableCopiesChange = 0;

   if (request.reason === 'purchase' || request.reason === 'donation') {
    totalCopiesChange = request.quantity;
    availableCopiesChange = request.quantity;

  } else if (
    request.reason === 'damaged' &&
    (request.borrowingId || request.memberId)
  ) {
    if (
      request.quantity !== 1 ||
      !request.borrowingId ||
      !request.memberId ||
      !request.damageSeverity ||
      request.borrowerResponsible === undefined
    ) {
      return 'A damaged return needs one loan, one member, a severity, and responsibility.';
    }

    if (book.availableCopies >= book.totalCopies) {
      return 'The copy counts do not show a checked-out copy.';
    }

    if (
      this.adjustments().some(
        (item) =>
          item.reason === 'damaged' &&
          item.borrowingId === request.borrowingId,
      )
    ) {
      return 'Damage has already been recorded for this loan.';
    }

    if (request.damageSeverity === 'minor') {
      availableCopiesChange = 1;
    } else if (request.damageSeverity === 'severe') {
      totalCopiesChange = -1;
    }
    // Moderate damage leaves the copy unavailable until its repair is recorded.

  } else if (request.reason === 'repair-completed') {
    if (
      request.quantity !== 1 ||
      !request.borrowingId ||
      !request.memberId
    ) {
      return 'A completed repair must be linked to one loan and member.';
    }

    const moderateDamage = this.adjustments().some(
      (item) =>
        item.reason === 'damaged' &&
        item.borrowingId === request.borrowingId &&
        item.memberId === request.memberId &&
        item.damageSeverity === 'moderate',
    );

    if (!moderateDamage) {
      return 'Only a moderately damaged return can be marked repaired.';
    }

    if (
      this.adjustments().some(
        (item) =>
          item.reason === 'repair-completed' &&
          item.borrowingId === request.borrowingId,
      )
    ) {
      return 'Repair has already been completed for this loan.';
    }

    if (book.availableCopies >= book.totalCopies) {
      return 'No unavailable copy is recorded for this book.';
    }

    availableCopiesChange = 1;

  } else if (
    request.reason === 'missing' ||
    request.reason === 'damaged'
  ) {
    if (request.quantity > book.availableCopies) {
      return 'There are not enough available copies to remove.';
    }

    totalCopiesChange = -request.quantity;
    availableCopiesChange = -request.quantity;

  } else {
    if (
      request.quantity !== 1 ||
      !request.borrowingId ||
      !request.memberId
    ) {
      return 'A borrower-lost adjustment must be linked to one loan and member.';
    }

    if (book.totalCopies - 1 < book.availableCopies) {
      return 'The copy counts do not show an outstanding copy to remove.';
    }

    totalCopiesChange = -1;
  }

    const nextNumber =
      this.adjustments().reduce((largest, adjustment) => {
        const match = /^IA-(\d+)$/.exec(adjustment.id);
        return match ? Math.max(largest, Number(match[1])) : largest;
      }, 0) + 1;

    const adjustment: InventoryAdjustment = {
      id: `IA-${String(nextNumber).padStart(3, '0')}`,
      bookId: request.bookId,
      reason: request.reason,
      quantity: request.quantity,
      totalCopiesChange,
      availableCopiesChange,
      note: request.note.trim(),
      adjustedAt: this.toDateString(new Date()),
      adjustedBy: user.email,
      borrowingId: request.borrowingId,
      memberId: request.memberId,
      damageSeverity: request.damageSeverity,
      borrowerResponsible: request.borrowerResponsible,
    };

    this.bookService.books.update((books) =>
      books.map((item) =>
        item.id === request.bookId
          ? {
              ...item,
              totalCopies: item.totalCopies + totalCopiesChange,
              availableCopies:
                item.availableCopies + availableCopiesChange,
            }
          : item,
      ),
    );

    this.adjustments.update((items) => [...items, adjustment]);

    return null;
  }

  private toDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}