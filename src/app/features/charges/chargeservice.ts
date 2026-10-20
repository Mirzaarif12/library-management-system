import { Service, afterNextRender, effect, signal } from '@angular/core';
import type { MemberCharge } from '../../models/member-charge';
import type { DamageSeverity } from '../../models/borrowing';

@Service()
export class ChargeService {
  private readonly storageReady = signal(false);

  readonly charges = signal<MemberCharge[]>([]);

  constructor() {
    afterNextRender(() => {
      try {
        const saved = localStorage.getItem('library-charges');

        if (saved) {
          const parsed: unknown = JSON.parse(saved);

          if (Array.isArray(parsed)) {
            this.charges.set(parsed as MemberCharge[]);
          }
        }
      } catch {
        // Keep an empty charge list if saved data cannot be read.
      } finally {
        this.storageReady.set(true);
      }
    });

    effect(() => {
      if (!this.storageReady()) return;

      localStorage.setItem('library-charges', JSON.stringify(this.charges()));
    });
  }

  createReplacementCharge(
    memberId: string,
    borrowingId: string,
    bookId: string,
    amount: number,
    paymentDueAt: string,
  ): void {
    const charge: MemberCharge = {
      id: this.nextChargeId(),
      memberId,
      borrowingId,
      bookId,
      reason: 'borrower-lost-book',
      amount,
      issuedAt: this.toDateString(new Date()),
      paymentDueAt,
      status: 'unpaid',
      paidAt: null,
      waivedAt: null,
      waiverReason: null,
    };

    this.charges.update((charges) => [...charges, charge]);
  }

  private toDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  markPaid(chargeId: string): string | null {
    const charge = this.charges().find((item) => item.id === chargeId);

    if (!charge) return 'Charge record not found.';
    if (charge.status !== 'unpaid') {
      return 'Only unpaid charges can be recorded as paid.';
    }

    const paidAt = this.toDateString(new Date());

    this.charges.update((charges) =>
      charges.map((item) =>
        item.id === chargeId
          ? { ...item, status: 'paid', paidAt }
          : item,
      ),
    );

    return null;
  }

  waiveCharge(chargeId: string, reason: string): string | null {
    const charge = this.charges().find((item) => item.id === chargeId);

    if (!charge) return 'Charge record not found.';
    if (charge.status !== 'unpaid') {
      return 'Only unpaid charges can be waived.';
    }
    if (!reason.trim()) return 'Enter a reason for waiving this charge.';

    const waivedAt = this.toDateString(new Date());

    this.charges.update((charges) =>
      charges.map((item) =>
        item.id === chargeId
          ? {
              ...item,
              status: 'waived',
              waivedAt,
              waiverReason: reason.trim(),
            }
          : item,
      ),
    );

    return null;
  }

  createLateReturnCharge(
    memberId: string,
    borrowingId: string,
    bookId: string,
    amount: number,
    paymentDueAt: string,
  ): void {
    const charge: MemberCharge = {
      id: this.nextChargeId(),
      memberId,
      borrowingId,
      bookId,
      reason: 'late-return',
      amount,
      issuedAt: this.toDateString(new Date()),
      paymentDueAt,
      status: 'unpaid',
      paidAt: null,
      waivedAt: null,
      waiverReason: null,
    };

    this.charges.update((charges) => [...charges, charge]);
  }

  damageAmount(severity: DamageSeverity, bookPrice: number): number | null {
    if (!Number.isFinite(bookPrice) || bookPrice <= 0) return null;

    const priceInSen = Math.round(bookPrice * 100);

    if (severity === 'minor') {
      return Math.min(500, priceInSen) / 100;
    }

    if (severity === 'moderate') {
      return Math.round((priceInSen * 35) / 100) / 100;
    }

    return priceInSen / 100;
  }

  createDamageCharge(
    memberId: string,
    borrowingId: string,
    bookId: string,
    severity: DamageSeverity,
    bookPrice: number,
    paymentDueAt: string,
  ): string | null {
    const amount = this.damageAmount(severity, bookPrice);

    if (amount === null) {
      return 'Set a valid book replacement cost above RM 0 first.';
    }

    if (
      this.charges().some(
        (item) =>
          item.borrowingId === borrowingId &&
          item.reason === 'borrower-damaged-book',
      )
    ) {
      return 'A damage charge already exists for this loan.';
    }

    const charge: MemberCharge = {
      id: this.nextChargeId(),
      memberId,
      borrowingId,
      bookId,
      reason: 'borrower-damaged-book',
      damageSeverity: severity,
      bookPriceAtIssue: bookPrice,
      amount,
      issuedAt: this.toDateString(new Date()),
      paymentDueAt,
      status: 'unpaid',
      paidAt: null,
      waivedAt: null,
      waiverReason: null,
    };

    this.charges.update((charges) => [...charges, charge]);
    return null;
  }

  private nextChargeId(): string {
    const highestNumber = this.charges().reduce((highest, charge) => {
      // Preserve old 13-digit timestamp IDs without including them in the counter.
      const match = /^CH-(\d{1,12})$/.exec(charge.id);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);

    return `CH-${String(highestNumber + 1).padStart(4, '0')}`;
  }
  
}
