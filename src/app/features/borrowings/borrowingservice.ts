import { Service, afterNextRender, effect, signal, inject } from '@angular/core';
import type { Borrowing, DamageSeverity } from '../../models/borrowing';
import {BookService} from '../books/bookservice';
import {MemberService} from '../members/memberservice';
import { ChargeService } from '../charges/chargeservice';
import { InventoryService } from '../books/inventoryservice';

const LOAN_PERIOD_DAYS = 14;
const FINE_PER_DAY_RM = 1; // Placeholder rate
const MILLISECONDS_PER_DAY = 86_400_000;
const CHARGE_PAYMENT_PERIOD_DAYS = 60;

@Service()
export class BorrowingService {
  private readonly storageReady = signal(false);
  private readonly bookService = inject(BookService);
  private readonly memberService = inject(MemberService);
  private readonly chargeService = inject(ChargeService);
  private readonly inventoryService = inject(InventoryService);

  readonly borrowings = signal<Borrowing[]>([]);

  constructor() {
    afterNextRender(() => {
      try {
        const saved = localStorage.getItem('library-borrowings');

        if (saved) {
          const parsed: unknown = JSON.parse(saved);

          if (Array.isArray(parsed)) {
            this.borrowings.set(parsed as Borrowing[]);
          }
        }
      } catch {
        // Start with an empty list if saved data can't be read.
      } finally {
        this.storageReady.set(true);
      }
    });

    effect(() => {
      if (!this.storageReady()) return;

      try {
        localStorage.setItem(
          'library-borrowings',
          JSON.stringify(this.borrowings()),
        );
      } catch {
        // The browser may prevent local storage from being used.
      }
    });
  }
  /**
   * Borrow a book.
   * @param memberId The ID of the member borrowing the book.
   * @param bookId The ID of the book being borrowed.
   * @returns An error message if the operation fails, or null if it succeeds.
   */

  borrowBook(memberId: string, bookId: string): string | null {
    const member = this.memberService.members().find((item) => item.id === memberId);
    const book = this.bookService.books().find((item) => item.id === bookId);

    if (!member) return 'Member not found.';
    if (member.status !== 'active') return 'This member account is suspended.';
    if (!book) return 'Book not found.';
    if (book.availableCopies < 1) return 'No copies of this book are available.';

    const activeLoans = this.borrowings().filter(
      (loan) =>
        loan.memberId === memberId &&
        this.isActiveLoan(loan),
    ).length;

    if (activeLoans >= member.borrowingLimit) {
      return `This member has reached the limit of ${member.borrowingLimit} books.`;
    }

    const borrowedDate = new Date();
    const dueDate = new Date(borrowedDate);
    dueDate.setDate(dueDate.getDate() + LOAN_PERIOD_DAYS);

    const nextNumber =
      this.borrowings().reduce((largest, loan) => {
        const match = /^BR-(\d+)$/.exec(loan.id);
        return match ? Math.max(largest, Number(match[1])) : largest;
      }, 0) + 1;

    const newLoan: Borrowing = {
      id: `BR-${String(nextNumber).padStart(3, '0')}`,
      memberId,
      bookId,
      borrowedAt: this.toDateString(borrowedDate),
      dueAt: this.toDateString(dueDate),
      returnedAt: null,
      lostAt: null,
    };

    this.borrowings.update((loans) => [...loans, newLoan]);

    this.bookService.books.update((books) =>
      books.map((item) =>
        item.id === bookId
          ? { ...item, availableCopies: item.availableCopies - 1 }
          : item,
      ),
    );

    return null;
  }
  
  private toDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

 // Return a borrowed book. 
  returnBook(borrowingId: string): string | null {
    const loan = this.borrowings().find((item) => item.id === borrowingId);

    if (!loan) return 'Loan record not found.';
    if (!this.isActiveLoan(loan)) {
      return loan.lostAt != null
        ? 'This book has already been marked as lost.'
        : 'This book has already been returned.';
    }

    const returnedAt = this.toDateString(new Date());


    const completedLoan = { ...loan, returnedAt };
    const lateFine = this.fineAmount(completedLoan);

    if (lateFine > 0) {
      const paymentDueDate = new Date(`${returnedAt}T00:00:00`);
      paymentDueDate.setDate(
        paymentDueDate.getDate() + CHARGE_PAYMENT_PERIOD_DAYS,
      );

      this.chargeService.createLateReturnCharge(
        loan.memberId,
        loan.id,
        loan.bookId,
        lateFine,
        this.toDateString(paymentDueDate),
      );
    }
    this.borrowings.update((loans) =>
      loans.map((item) =>
        item.id === borrowingId
  ? { ...item, returnedAt, returnCondition: 'good' as const }
  : item,
      ),
    );

    this.bookService.books.update((books) =>
      books.map((book) =>
        book.id === loan.bookId
          ? {
              ...book,
              availableCopies: Math.min(
                book.totalCopies,
                book.availableCopies + 1,
              ),
            }
          : book,
      ),
    );

    return null;
  }

  markDamagedReturn(
    borrowingId: string,
    note: string,
    severity?: DamageSeverity,
    borrowerResponsible?: boolean,
  ): string | null {
    const loan = this.borrowings().find((item) => item.id === borrowingId);

    if (!loan) return 'Loan record not found.';
    if (!this.isActiveLoan(loan)) {
      return loan.lostAt != null
        ? 'This book has already been marked as lost.'
        : 'This book has already been returned.';
    }

    if (!note.trim()) return 'Enter a note describing the damage.';
    if (!severity) return 'Select the damage severity.';
    if (borrowerResponsible === undefined) {
      return 'Choose whether the borrower is responsible.';
    }

    const book = this.bookService.books().find((item) => item.id === loan.bookId);
    if (!book) return 'The book record could not be found.';

    // Check charge requirements before changing inventory.
    if (borrowerResponsible) {
      if (this.chargeService.damageAmount(severity, book.replacementCost) === null) {
        return 'Set a valid book replacement cost above RM 0 first.';
      }

      if (
        this.chargeService.charges().some(
          (charge) =>
            charge.borrowingId === loan.id &&
            charge.reason === 'borrower-damaged-book',
        )
      ) {
        return 'A damage charge already exists for this loan.';
      }
    }

    const adjustmentError = this.inventoryService.recordAdjustment({
      bookId: loan.bookId,
      reason: 'damaged',
      quantity: 1,
      note: note.trim(),
      borrowingId: loan.id,
      memberId: loan.memberId,
      damageSeverity: severity,
      borrowerResponsible,
    });

    if (adjustmentError) return adjustmentError;

    const returnedAt = this.toDateString(new Date());
    const paymentDueDate = new Date(`${returnedAt}T00:00:00`);
    paymentDueDate.setDate(
      paymentDueDate.getDate() + CHARGE_PAYMENT_PERIOD_DAYS,
    );
    const paymentDueAt = this.toDateString(paymentDueDate);

    if (borrowerResponsible) {
      this.chargeService.createDamageCharge(
        loan.memberId,
        loan.id,
        loan.bookId,
        severity,
        book.replacementCost,
        paymentDueAt,
      );
    }

    const completedLoan: Borrowing = {
      ...loan,
      returnedAt,
      returnCondition: 'damaged',
      damageSeverity: severity,
      borrowerResponsible,
      repairCompletedAt: severity === 'moderate' ? null : undefined,
    };

    const lateFine = this.fineAmount(completedLoan);
    if (lateFine > 0) {
      this.chargeService.createLateReturnCharge(
        loan.memberId,
        loan.id,
        loan.bookId,
        lateFine,
        paymentDueAt,
      );
    }

    this.borrowings.update((loans) =>
      loans.map((item) => item.id === borrowingId ? completedLoan : item),
    );

    return null;
  }

  completeRepair(borrowingId: string, note: string): string | null {
    const loan = this.borrowings().find((item) => item.id === borrowingId);

    if (!loan) return 'Loan record not found.';
    if (
      loan.returnedAt === null ||
      loan.returnCondition !== 'damaged' ||
      loan.damageSeverity !== 'moderate'
    ) {
      return 'Only a returned book with moderate damage can be marked repaired.';
    }

    if (loan.repairCompletedAt != null) {
      return 'This repair has already been recorded.';
    }

    if (!note.trim()) {
      return 'Enter a note describing the completed repair.';
    }

    const adjustmentError = this.inventoryService.recordAdjustment({
      bookId: loan.bookId,
      reason: 'repair-completed',
      quantity: 1,
      note: note.trim(),
      borrowingId: loan.id,
      memberId: loan.memberId,
    });

    if (adjustmentError) return adjustmentError;

    const repairCompletedAt = this.toDateString(new Date());

    this.borrowings.update((loans) =>
      loans.map((item) =>
        item.id === borrowingId
          ? { ...item, repairCompletedAt }
          : item,
      ),
    );

    return null;
  }

  lateDays(loan: Borrowing): number {
  const endDate = loan.returnedAt ?? loan.lostAt ?? this.toDateString(new Date());

  return Math.max(
      0,
      this.dayNumber(endDate) - this.dayNumber(loan.dueAt),
    );
  }

  fineAmount(loan: Borrowing): number {
    return this.lateDays(loan) * FINE_PER_DAY_RM;
  }

  private dayNumber(date: string): number {
    const [year, month, day] = date.split('-').map(Number);
    return Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY;
  }

  markLost(borrowingId: string, paymentDueAt: string): string | null {
    const loan = this.borrowings().find((item) => item.id === borrowingId);

    if (!loan) return 'Loan record not found.';
    if (loan.returnedAt !== null) return 'This book has already been returned.';
    if (loan.lostAt != null) return 'This book has already been marked as lost.';
    if (!paymentDueAt) return 'Enter a payment deadline first.';

    const book = this.bookService.books().find((item) => item.id === loan.bookId);

    if (!book) return 'The book record could not be found.';
    if (!Number.isFinite(book.replacementCost) || book.replacementCost < 0) {
      return 'Enter a valid replacement cost for this book first.';
    }

    const adjustmentError = this.inventoryService.recordAdjustment({
      bookId: book.id,
      reason: 'borrower-lost',
      quantity: 1,
      note: 'Copy reported lost while checked out.',
      borrowingId: loan.id,
      memberId: loan.memberId,
    });

    if (adjustmentError) return adjustmentError;

    const lostAt = this.toDateString(new Date());

    this.borrowings.update((loans) =>
      loans.map((item) =>
        item.id === borrowingId ? { ...item, lostAt } : item,
      ),
    );

    this.chargeService.createReplacementCharge(
      loan.memberId,
      loan.id,
      book.id,
      book.replacementCost,
      paymentDueAt,
    );

    return null;
  }
  isActiveLoan(loan: Borrowing): boolean {
    return (
      loan.returnedAt === null &&
      (loan.lostAt === null || loan.lostAt === undefined)
    );
  }
}