import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import type { Book } from '../../../models/book';
import type { Borrowing } from '../../../models/borrowing';
import type { MemberCharge } from '../../../models/member-charge';
import { AuthService } from '../../auth/authservice';
import { BookService } from '../../books/bookservice';
import { BorrowingService } from '../../borrowings/borrowingservice';
import { ChargeService } from '../../charges/chargeservice';

type LoanStatus = 'borrowed' | 'overdue' | 'returned' | 'damaged' | 'lost';
type LoanFilter = 'all' | 'borrowed' | 'overdue' | 'returned' | 'lost';
type ChargeFilter = 'all' | 'unpaid' | 'paid' | 'overdue' | 'waived';
type LoanSort = 'newest' | 'oldest' | 'due';

@Component({
  imports: [NgOptimizedImage],
  selector: 'app-my-loans',
  styleUrl: './my-loans.css',
  templateUrl: './my-loans.html',
})
export class MyLoans {
  private readonly authService = inject(AuthService);
  private readonly borrowingService = inject(BorrowingService);
  private readonly bookService = inject(BookService);
  private readonly chargeService = inject(ChargeService);

  protected readonly today = this.toDateString(new Date());
  protected readonly dueSoonCutOff = this.dateAfterDays(3);
  protected readonly loanFilter = signal<LoanFilter>('all');
  protected readonly chargeFilter = signal<ChargeFilter>('all');
  protected readonly loanSearch = signal('');
  protected readonly loanSort = signal<LoanSort>('newest');
  protected readonly loanPage = signal(1);
  protected readonly chargePage = signal(1);
  protected readonly expandedLoanId = signal<string | null>(null);
  protected readonly expandedChargeId = signal<string | null>(null);
  protected readonly pageSize = 8;

  protected readonly myLoans = computed(() => {
    const memberId = this.authService.currentUser()?.memberId;
    if (!memberId) return [];

    return this.borrowingService
      .borrowings()
      .filter((loan) => loan.memberId === memberId)
      .sort((a, b) => b.borrowedAt.localeCompare(a.borrowedAt));
  });

  protected readonly myCharges = computed(() => {
    const memberId = this.authService.currentUser()?.memberId;
    if (!memberId) return [];

    return this.chargeService
      .charges()
      .filter((charge) => charge.memberId === memberId)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  });

  protected readonly overdueLoans = computed(() =>
    this.myLoans().filter((loan) => this.loanStatus(loan) === 'overdue'),
  );

  protected readonly dueSoonLoans = computed(() =>
    this.myLoans().filter(
      (loan) =>
        this.loanStatus(loan) === 'borrowed' &&
        loan.dueAt <= this.dueSoonCutOff,
    ),
  );

  protected readonly overdueReplacementCharges = computed(() =>
    this.myCharges().filter(
      (charge) => charge.status === 'unpaid' && charge.paymentDueAt < this.today,
    ),
  );

  protected readonly unpaidChargeTotal = computed(() =>
    this.myCharges()
      .filter((charge) => charge.status === 'unpaid')
      .reduce((total, charge) => total + charge.amount, 0),
  );

  protected readonly borrowedCount = computed(() =>
    this.myLoans().filter((loan) => this.loanStatus(loan) === 'borrowed').length,
  );
  protected readonly returnedCount = computed(() =>
    this.myLoans().filter((loan) => {
      const status = this.loanStatus(loan);
      return status === 'returned' || status === 'damaged';
    }).length,
  );
  protected readonly lostCount = computed(() =>
    this.myLoans().filter((loan) => this.loanStatus(loan) === 'lost').length,
  );
  protected readonly unpaidCount = computed(() =>
    this.myCharges().filter(
      (charge) => charge.status === 'unpaid' && charge.paymentDueAt >= this.today,
    ).length,
  );
  protected readonly paidCount = computed(() =>
    this.myCharges().filter((charge) => charge.status === 'paid').length,
  );
  protected readonly waivedCount = computed(() =>
    this.myCharges().filter((charge) => charge.status === 'waived').length,
  );

  protected readonly filteredLoans = computed(() => {
    const query = this.loanSearch().trim().toLowerCase();
    const filter = this.loanFilter();
    const loans = this.myLoans().filter((loan) => {
      const status = this.loanStatus(loan);
      const matchesFilter =
        filter === 'all' ||
        status === filter ||
        (filter === 'returned' && status === 'damaged');
      const matchesSearch =
        !query ||
        `${loan.id} ${this.bookTitle(loan.bookId)} ${this.bookAuthor(loan.bookId)}`
          .toLowerCase()
          .includes(query);
      return matchesFilter && matchesSearch;
    });

    if (this.loanSort() === 'oldest') {
      return loans.sort((a, b) => a.borrowedAt.localeCompare(b.borrowedAt));
    }
    if (this.loanSort() === 'due') {
      return loans.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    }
    return loans;
  });

  protected readonly loanPageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredLoans().length / this.pageSize)),
  );
  protected readonly currentLoanPage = computed(() =>
    Math.min(this.loanPage(), this.loanPageCount()),
  );
  protected readonly visibleLoans = computed(() => {
    const start = (this.currentLoanPage() - 1) * this.pageSize;
    return this.filteredLoans().slice(start, start + this.pageSize);
  });
  protected readonly loanRangeStart = computed(() =>
    this.filteredLoans().length === 0
      ? 0
      : (this.currentLoanPage() - 1) * this.pageSize + 1,
  );
  protected readonly loanRangeEnd = computed(() =>
    Math.min(this.currentLoanPage() * this.pageSize, this.filteredLoans().length),
  );

  protected readonly filteredCharges = computed(() => {
    const filter = this.chargeFilter();
    return this.myCharges().filter((charge) => {
      if (filter === 'all') return true;
      if (filter === 'overdue') {
        return charge.status === 'unpaid' && charge.paymentDueAt < this.today;
      }
      if (filter === 'unpaid') {
        return charge.status === 'unpaid' && charge.paymentDueAt >= this.today;
      }
      return charge.status === filter;
    });
  });
  protected readonly chargePageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredCharges().length / this.pageSize)),
  );
  protected readonly currentChargePage = computed(() =>
    Math.min(this.chargePage(), this.chargePageCount()),
  );
  protected readonly visibleCharges = computed(() => {
    const start = (this.currentChargePage() - 1) * this.pageSize;
    return this.filteredCharges().slice(start, start + this.pageSize);
  });
  protected readonly chargeRangeStart = computed(() =>
    this.filteredCharges().length === 0
      ? 0
      : (this.currentChargePage() - 1) * this.pageSize + 1,
  );
  protected readonly chargeRangeEnd = computed(() =>
    Math.min(this.currentChargePage() * this.pageSize, this.filteredCharges().length),
  );

  protected book(bookId: string): Book | undefined {
    return this.bookService.books().find((item) => item.id === bookId);
  }

  protected bookTitle(bookId: string): string {
    return this.book(bookId)?.title ?? 'Unknown book';
  }

  protected bookAuthor(bookId: string): string {
    return this.book(bookId)?.author ?? 'Unknown author';
  }

  protected bookCover(bookId: string): string | null {
    return this.book(bookId)?.coverUrl || null;
  }

  protected fineAmount(loan: Borrowing): number {
    return this.borrowingService.fineAmount(loan);
  }

  protected loanStatus(loan: Borrowing): LoanStatus {
    if (loan.lostAt != null) return 'lost';
    if (loan.returnedAt !== null) {
      return loan.returnCondition === 'damaged' ? 'damaged' : 'returned';
    }
    return loan.dueAt < this.today ? 'overdue' : 'borrowed';
  }

  protected loanStatusLabel(loan: Borrowing): string {
    const status = this.loanStatus(loan);
    if (status === 'borrowed') return 'On loan';
    if (status === 'damaged') return 'Returned damaged';
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  protected chargeStatus(charge: MemberCharge): string {
    if (charge.status === 'unpaid' && charge.paymentDueAt < this.today) {
      return 'Payment overdue';
    }
    return charge.status.charAt(0).toUpperCase() + charge.status.slice(1);
  }

  protected chargeReason(charge: MemberCharge): string {
    if (charge.reason === 'late-return') return 'Late return fine';
    if (charge.reason === 'borrower-damaged-book') {
      return charge.damageSeverity
        ? `${charge.damageSeverity.charAt(0).toUpperCase() + charge.damageSeverity.slice(1)} damage`
        : 'Damaged-book charge';
    }
    return 'Lost-book replacement';
  }

  protected setLoanFilter(filter: LoanFilter): void {
    this.loanFilter.set(filter);
    this.loanPage.set(1);
  }

  protected setChargeFilter(filter: ChargeFilter): void {
    this.chargeFilter.set(filter);
    this.chargePage.set(1);
  }

  protected setLoanSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.loanSearch.set(target.value);
      this.loanPage.set(1);
    }
  }

  protected setLoanSort(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const value = target.value;
    this.loanSort.set(value === 'oldest' || value === 'due' ? value : 'newest');
    this.loanPage.set(1);
  }

  protected changeLoanPage(delta: number): void {
    this.loanPage.set(
      Math.min(this.loanPageCount(), Math.max(1, this.currentLoanPage() + delta)),
    );
  }

  protected changeChargePage(delta: number): void {
    this.chargePage.set(
      Math.min(this.chargePageCount(), Math.max(1, this.currentChargePage() + delta)),
    );
  }

  protected toggleLoanDetails(id: string): void {
    this.expandedLoanId.update((current) => (current === id ? null : id));
  }

  protected toggleChargeDetails(id: string): void {
    this.expandedChargeId.update((current) => (current === id ? null : id));
  }

  private toDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private dateAfterDays(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return this.toDateString(date);
  }
}
