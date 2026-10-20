import { Service, afterNextRender, inject, signal } from '@angular/core';
import type { Book } from '../../models/book';
import type { Borrowing } from '../../models/borrowing';
import type { InventoryAdjustment } from '../../models/inventory-adjustment';
import type { MemberCharge } from '../../models/member-charge';
import type { Reservation } from '../../models/reservation';
import { AuthService } from '../auth/authservice';
import { BookService } from '../books/bookservice';
import { InventoryService } from '../books/inventoryservice';
import { BorrowingService } from '../borrowings/borrowingservice';
import { ChargeService } from '../charges/chargeservice';
import { MemberService } from '../members/memberservice';
import { ReservationService } from '../reservations/reservationservice';

const DEMO_MARKER = 'library-demo-data-v1';
const HOUR_MS = 3_600_000;

function dateAfterDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeAfterHours(hours: number): string {
  return new Date(Date.now() + hours * HOUR_MS).toISOString();
}

function nextIdFactory(
  records: readonly { id: string }[],
  prefix: string,
  minimumDigits: number,
): () => string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let highest = records.reduce((current, record) => {
    const match = pattern.exec(record.id);
    // Older records may use a timestamp ID. Keep newly generated IDs short.
    return match && match[1].length <= 6
      ? Math.max(current, Number(match[1]))
      : current;
  }, 0);

  return () => `${prefix}-${String(++highest).padStart(minimumDigits, '0')}`;
}

@Service()
export class DemoDataService {
  private readonly authService = inject(AuthService);
  private readonly bookService = inject(BookService);
  private readonly memberService = inject(MemberService);
  private readonly borrowingService = inject(BorrowingService);
  private readonly reservationService = inject(ReservationService);
  private readonly chargeService = inject(ChargeService);
  private readonly inventoryService = inject(InventoryService);

  readonly ready = signal(false);
  readonly loaded = signal(false);

  constructor() {
    afterNextRender(() => {
      try {
        this.loaded.set(localStorage.getItem(DEMO_MARKER) === '1');
      } catch {
        // The import action will report a storage error if storage is blocked.
      } finally {
        this.ready.set(true);
      }
    });
  }

  load(): string | null {
    if (!this.ready()) return 'Please wait for saved library data to load.';
    if (
      !this.authService.isSignedIn() ||
      this.authService.currentUser()?.role !== 'admin'
    ) {
      return 'Only an admin can load demo data.';
    }
    if (this.loaded()) return 'Demo data has already been loaded in this browser.';

    const members = this.memberService.members().filter((member) => {
      const activeLoans = this.borrowingService.borrowings().filter(
        (loan) =>
          loan.memberId === member.id && this.borrowingService.isActiveLoan(loan),
      ).length;
      return member.status === 'active' && activeLoans < member.borrowingLimit;
    });
    const firstMember =
      members.find((member) => member.email.toLowerCase() === 'sara@example.com') ??
      members[0];
    const secondMember =
      members.find(
        (member) =>
          member.id !== firstMember?.id &&
          member.email.toLowerCase() === 'john@example.com',
      ) ?? members.find((member) => member.id !== firstMember?.id);

    if (!firstMember || !secondMember) {
      return 'Two active members with a free borrowing slot are needed to load demo activity.';
    }

    const currentBooks = this.bookService.books();
    if (currentBooks.some((book) => book.isbn.startsWith('DEMO-LIB-'))) {
      return 'Demo books are already present. Existing records were left unchanged.';
    }

    const nextBookId = nextIdFactory(currentBooks, 'BK', 3);
    const nextLoanId = nextIdFactory(this.borrowingService.borrowings(), 'BR', 3);
    const nextReservationId = nextIdFactory(this.reservationService.reservations(), 'RS', 3);
    const nextChargeId = nextIdFactory(this.chargeService.charges(), 'CH', 4);
    const nextAdjustmentId = nextIdFactory(this.inventoryService.adjustments(), 'IA', 3);

    // These copy counts already include the effects of the demo activity below.
    const demoBooks: Book[] = [
      {
        id: nextBookId(),
        isbn: 'DEMO-LIB-001',
        title: 'The Lantern Atlas (Demo)',
        author: 'A. Rahman',
        category: 'Fiction',
        publisher: 'Library Demo Press',
        publicationYear: 2023,
        replacementCost: 40,
        totalCopies: 4,
        availableCopies: 3,
        description: 'A fictional journey through a collection of maps and hidden stories.',
        coverUrl: '/covers/demo-lantern-atlas.svg',
      },
      {
        id: nextBookId(),
        isbn: 'DEMO-LIB-002',
        title: 'Rainforest Field Notes (Demo)',
        author: 'N. Lim',
        category: 'Nature',
        publisher: 'Library Demo Press',
        publicationYear: 2021,
        replacementCost: 60,
        totalCopies: 3,
        availableCopies: 1,
        description: 'An illustrated introduction to rainforest habitats and conservation.',
        coverUrl: '/covers/demo-rainforest-notes.svg',
      },
      {
        id: nextBookId(),
        isbn: 'DEMO-LIB-003',
        title: 'Everyday Systems (Demo)',
        author: 'M. Tan',
        category: 'Design',
        publisher: 'Library Demo Press',
        publicationYear: 2024,
        replacementCost: 80,
        totalCopies: 2,
        availableCopies: 2,
        description: 'A practical look at the design of services and everyday processes.',
        coverUrl: '/covers/demo-everyday-systems.svg',
      },
    ];
    const [lantern, rainforest, systems] = demoBooks;

    const demoLoans: Borrowing[] = [
      {
        id: nextLoanId(), memberId: firstMember.id, bookId: lantern.id,
        borrowedAt: dateAfterDays(-11), dueAt: dateAfterDays(3),
        returnedAt: null, lostAt: null,
      },
      {
        id: nextLoanId(), memberId: secondMember.id, bookId: rainforest.id,
        borrowedAt: dateAfterDays(-16), dueAt: dateAfterDays(-2),
        returnedAt: null, lostAt: null,
      },
      {
        id: nextLoanId(), memberId: secondMember.id, bookId: lantern.id,
        borrowedAt: dateAfterDays(-30), dueAt: dateAfterDays(-16),
        returnedAt: dateAfterDays(-13), returnCondition: 'good', lostAt: null,
      },
      {
        id: nextLoanId(), memberId: secondMember.id, bookId: lantern.id,
        borrowedAt: dateAfterDays(-28), dueAt: dateAfterDays(-14),
        returnedAt: dateAfterDays(-15), returnCondition: 'damaged',
        damageSeverity: 'minor', borrowerResponsible: true, lostAt: null,
      },
      {
        id: nextLoanId(), memberId: firstMember.id, bookId: rainforest.id,
        borrowedAt: dateAfterDays(-20), dueAt: dateAfterDays(-6),
        returnedAt: dateAfterDays(-7), returnCondition: 'damaged',
        damageSeverity: 'moderate', borrowerResponsible: true,
        repairCompletedAt: null, lostAt: null,
      },
      {
        id: nextLoanId(), memberId: secondMember.id, bookId: systems.id,
        borrowedAt: dateAfterDays(-90), dueAt: dateAfterDays(-76),
        returnedAt: dateAfterDays(-77), returnCondition: 'damaged',
        damageSeverity: 'severe', borrowerResponsible: true, lostAt: null,
      },
      {
        id: nextLoanId(), memberId: firstMember.id, bookId: systems.id,
        borrowedAt: dateAfterDays(-46), dueAt: dateAfterDays(-32),
        returnedAt: null, lostAt: dateAfterDays(-33),
      },
    ];
    const [, , returnedLate, minorDamage, moderateDamage, severeDamage, lost] = demoLoans;

    const demoReservations: Reservation[] = [
      {
        id: nextReservationId(), memberId: firstMember.id, bookId: rainforest.id,
        requestedAt: timeAfterHours(-4), status: 'waiting',
        readyAt: null, pickupDeadline: null, collectedAt: null,
      },
      {
        id: nextReservationId(), memberId: secondMember.id, bookId: systems.id,
        requestedAt: timeAfterHours(-20), status: 'ready',
        readyAt: timeAfterHours(-8), pickupDeadline: timeAfterHours(40),
        collectedAt: null,
      },
      {
        id: nextReservationId(), memberId: firstMember.id, bookId: lantern.id,
        requestedAt: timeAfterHours(-13 * 24), status: 'collected',
        readyAt: timeAfterHours(-12 * 24),
        pickupDeadline: timeAfterHours(-10 * 24),
        collectedAt: timeAfterHours(-11 * 24),
      },
      {
        id: nextReservationId(), memberId: secondMember.id, bookId: lantern.id,
        requestedAt: timeAfterHours(-5 * 24), status: 'cancelled',
        readyAt: null, pickupDeadline: null, collectedAt: null,
      },
      {
        id: nextReservationId(), memberId: firstMember.id, bookId: systems.id,
        requestedAt: timeAfterHours(-7 * 24), status: 'expired',
        readyAt: timeAfterHours(-6 * 24),
        pickupDeadline: timeAfterHours(-4 * 24), collectedAt: null,
      },
    ];

    const demoCharges: MemberCharge[] = [
      {
        id: nextChargeId(), memberId: secondMember.id,
        borrowingId: returnedLate.id, bookId: lantern.id,
        reason: 'late-return', amount: 3,
        issuedAt: dateAfterDays(-13), paymentDueAt: dateAfterDays(47),
        status: 'paid', paidAt: dateAfterDays(-10),
      },
      {
        id: nextChargeId(), memberId: secondMember.id,
        borrowingId: minorDamage.id, bookId: lantern.id,
        reason: 'borrower-damaged-book', damageSeverity: 'minor',
        bookPriceAtIssue: 40, amount: 5,
        issuedAt: dateAfterDays(-15), paymentDueAt: dateAfterDays(45),
        status: 'paid', paidAt: dateAfterDays(-10),
      },
      {
        id: nextChargeId(), memberId: firstMember.id,
        borrowingId: moderateDamage.id, bookId: rainforest.id,
        reason: 'borrower-damaged-book', damageSeverity: 'moderate',
        bookPriceAtIssue: 60, amount: 21,
        issuedAt: dateAfterDays(-7), paymentDueAt: dateAfterDays(53),
        status: 'unpaid', paidAt: null,
      },
      {
        id: nextChargeId(), memberId: secondMember.id,
        borrowingId: severeDamage.id, bookId: systems.id,
        reason: 'borrower-damaged-book', damageSeverity: 'severe',
        bookPriceAtIssue: 80, amount: 80,
        issuedAt: dateAfterDays(-77), paymentDueAt: dateAfterDays(-17),
        status: 'unpaid', paidAt: null,
      },
      {
        id: nextChargeId(), memberId: firstMember.id,
        borrowingId: lost.id, bookId: systems.id,
        reason: 'borrower-lost-book', amount: 80,
        issuedAt: dateAfterDays(-33), paymentDueAt: dateAfterDays(27),
        status: 'waived', paidAt: null,
        waivedAt: dateAfterDays(-20),
        waiverReason: 'Example training waiver.',
      },
    ];

    const adjustedBy = this.authService.currentUser()?.email ?? 'admin';
    const demoAdjustments: InventoryAdjustment[] = [
      {
        id: nextAdjustmentId(), bookId: lantern.id, reason: 'damaged',
        quantity: 1, totalCopiesChange: 0, availableCopiesChange: 1,
        note: 'Demo minor damage: copy remained usable.',
        adjustedAt: dateAfterDays(-15), adjustedBy,
        borrowingId: minorDamage.id, memberId: secondMember.id,
        damageSeverity: 'minor', borrowerResponsible: true,
      },
      {
        id: nextAdjustmentId(), bookId: rainforest.id, reason: 'damaged',
        quantity: 1, totalCopiesChange: 0, availableCopiesChange: 0,
        note: 'Demo moderate damage: copy is awaiting repair.',
        adjustedAt: dateAfterDays(-7), adjustedBy,
        borrowingId: moderateDamage.id, memberId: firstMember.id,
        damageSeverity: 'moderate', borrowerResponsible: true,
      },
      {
        id: nextAdjustmentId(), bookId: systems.id, reason: 'damaged',
        quantity: 1, totalCopiesChange: -1, availableCopiesChange: 0,
        note: 'Demo severe damage: unusable copy removed.',
        adjustedAt: dateAfterDays(-77), adjustedBy,
        borrowingId: severeDamage.id, memberId: secondMember.id,
        damageSeverity: 'severe', borrowerResponsible: true,
      },
      {
        id: nextAdjustmentId(), bookId: systems.id, reason: 'borrower-lost',
        quantity: 1, totalCopiesChange: -1, availableCopiesChange: 0,
        note: 'Demo lost book: copy removed.',
        adjustedAt: dateAfterDays(-33), adjustedBy,
        borrowingId: lost.id, memberId: firstMember.id,
      },
    ];

    const books = [...currentBooks, ...demoBooks];
    const loans = [...this.borrowingService.borrowings(), ...demoLoans];
    const reservations = [...this.reservationService.reservations(), ...demoReservations];
    const charges = [...this.chargeService.charges(), ...demoCharges];
    const adjustments = [...this.inventoryService.adjustments(), ...demoAdjustments];
    const entries: readonly (readonly [string, string])[] = [
      ['library-books', JSON.stringify(books)],
      ['library-borrowings', JSON.stringify(loans)],
      ['library-reservations', JSON.stringify(reservations)],
      ['library-charges', JSON.stringify(charges)],
      ['library-inventory-adjustments', JSON.stringify(adjustments)],
      [DEMO_MARKER, '1'],
    ];

    // Save every collection before updating signals; undo partial writes if storage fails.
    const previous = new Map<string, string | null>();
    try {
      for (const [key] of entries) previous.set(key, localStorage.getItem(key));
      for (const [key, value] of entries) localStorage.setItem(key, value);
    } catch {
      for (const [key, value] of previous) {
        try {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        } catch {
          // The browser may prevent recovery too; keep live signals unchanged.
        }
      }
      return 'Browser storage could not save the demo data. Existing records were left unchanged.';
    }

    this.bookService.books.set(books);
    this.borrowingService.borrowings.set(loans);
    this.reservationService.reservations.set(reservations);
    this.chargeService.charges.set(charges);
    this.inventoryService.adjustments.set(adjustments);
    this.loaded.set(true);

    return null;
  }
}
