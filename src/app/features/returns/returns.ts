import { Component, computed, inject, signal } from '@angular/core';
import { BookService } from '../books/bookservice';
import { MemberService } from '../members/memberservice';
import { BorrowingService } from '../borrowings/borrowingservice';
import { ChargeService } from '../charges/chargeservice';
import type { MemberCharge } from '../../models/member-charge';
import { NgOptimizedImage } from '@angular/common';

@Component({
  imports: [NgOptimizedImage],
  selector: 'app-returns',
  styleUrl: './returns.css',
  templateUrl: './returns.html',
})
export class Returns {
  private readonly borrowingService = inject(BorrowingService);
  private readonly bookService = inject(BookService);
  private readonly memberService = inject(MemberService);

  protected readonly activeLoans = computed(() =>
    this.borrowingService
      .borrowings()
      .filter((loan) => loan.returnedAt === null && (loan.lostAt === null || loan.lostAt === undefined)),
  );

  protected readonly loanSearch = signal('');
  protected readonly loanStatusFilter = signal<'all' | 'on-loan' | 'due-soon' | 'overdue'>('all');
  protected readonly loanPage = signal(1);
  protected readonly loanPageSize = 5;

  protected readonly filteredLoans = computed(() => {
    const query = this.loanSearch().trim().toLowerCase();
    const status = this.loanStatusFilter();

    return this.activeLoans().filter((loan) => {
      const matchesSearch =
        !query ||
        `${loan.id} ${this.memberName(loan.memberId)} ${this.bookTitle(loan.bookId)}`
          .toLowerCase()
          .includes(query);
      const daysRemaining = this.daysUntilDue(loan.dueAt);
      const matchesStatus =
        status === 'all' ||
        (status === 'on-loan' && daysRemaining >= 0) ||
        (status === 'due-soon' && daysRemaining >= 0 && daysRemaining <= 3) ||
        (status === 'overdue' && daysRemaining < 0);
      return matchesSearch && matchesStatus;
    });
  });

  protected readonly loanPageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredLoans().length / this.loanPageSize)),
  );
  protected readonly currentLoanPage = computed(() =>
    Math.min(this.loanPage(), this.loanPageCount()),
  );
  protected readonly visibleLoans = computed(() => {
    const start = (this.currentLoanPage() - 1) * this.loanPageSize;
    return this.filteredLoans().slice(start, start + this.loanPageSize);
  });
  protected readonly loanRangeStart = computed(() =>
    this.filteredLoans().length === 0
      ? 0
      : (this.currentLoanPage() - 1) * this.loanPageSize + 1,
  );
  protected readonly loanRangeEnd = computed(() =>
    Math.min(this.currentLoanPage() * this.loanPageSize, this.filteredLoans().length),
  );

  protected setLoanSearch(value: string): void {
    this.loanSearch.set(value);
    this.loanPage.set(1);
  }

  protected setLoanStatusFilter(value: string): void {
    const status =
      value === 'on-loan' || value === 'due-soon' || value === 'overdue'
        ? value
        : 'all';
    this.loanStatusFilter.set(status);
    this.loanPage.set(1);
  }

  protected changeLoanPage(delta: number): void {
    this.loanPage.set(
      Math.min(this.loanPageCount(), Math.max(1, this.currentLoanPage() + delta)),
    );
  }

  protected readonly pendingRepairs = computed(() =>
    this.borrowingService.borrowings().filter(
      (loan) =>
        loan.returnedAt !== null &&
        loan.returnCondition === 'damaged' &&
        loan.damageSeverity === 'moderate' &&
        loan.repairCompletedAt == null,
    ),
  );

  protected readonly repairSearch = signal('');
  protected readonly repairAgeFilter = signal<'all' | 'recent' | 'older'>('all');
  protected readonly visibleRepairs = computed(() => {
    const query = this.repairSearch().trim().toLowerCase();
    const ageFilter = this.repairAgeFilter();

    return [...this.pendingRepairs()]
      .filter((loan) => {
        const matchesSearch =
          !query ||
          `${loan.id} ${this.bookTitle(loan.bookId)} ${this.memberName(loan.memberId)}`
            .toLowerCase()
            .includes(query);
        const daysAgo = -this.daysUntilDue(loan.returnedAt ?? this.today);
        const matchesAge =
          ageFilter === 'all' ||
          (ageFilter === 'recent' && daysAgo <= 7) ||
          (ageFilter === 'older' && daysAgo > 7);
        return matchesSearch && matchesAge;
      })
      .sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''));
  });

  protected readonly repairBorrowingId = signal<string | null>(null);
  protected readonly repairNote = signal('');

  protected readonly lostBorrowingId = signal<string |null>(null);
  protected readonly damagedBorrowingId = signal<string | null>(null);
  protected readonly damageNote = signal('');
  protected readonly damageSeverity = signal('');
  protected readonly damageResponsibility = signal('');
  protected readonly paymentDueAt = signal ('');
  protected readonly feedback = signal('');
  protected readonly today = this.toDateString(new Date());

  protected daysUntilDue(dueAt: string): number {
    const due = Date.parse(`${dueAt}T00:00:00Z`);
    const today = Date.parse(`${this.today}T00:00:00Z`);
    return Math.round((due - today) / 86_400_000);
  }

  protected dueDateSummary(daysRemaining: number): string {
    if (daysRemaining === 0) return 'Due today';
    if (daysRemaining === 1) return '1 day left';
    if (daysRemaining > 1) return `${daysRemaining} days left`;
    if (daysRemaining === -1) return '1 day overdue';
    return `${Math.abs(daysRemaining)} days overdue`;
  }

  protected returnedDateSummary(returnedAt: string): string {
    const daysAgo = -this.daysUntilDue(returnedAt);
    if (daysAgo === 0) return 'Today';
    if (daysAgo === 1) return '1 day ago';
    return `${daysAgo} days ago`;
  }

  protected memberName(memberId: string): string {
    return (
      this.memberService.members().find((member) => member.id === memberId)
        ?.name ?? 'Unknown member'
    );
  }

  protected bookTitle(bookId: string): string {
    return (
      this.bookService.books().find((book) => book.id === bookId)?.title ??
      'Unknown book'
    );
  }

  protected bookCategory(bookId: string): string {
    return this.bookService.books().find((book) => book.id === bookId)?.category ?? 'Uncategorized';
  }

  protected bookCover(bookId: string): string | null {
    return this.bookService.books().find((book) => book.id === bookId)?.coverUrl || null;
  }

  protected memberInitial(memberId: string): string {
    return this.memberName(memberId).trim().charAt(0).toUpperCase() || '?';
  }

  protected returnLoan(borrowingId: string): void {
    const error = this.borrowingService.returnBook(borrowingId);
    this.feedback.set(error ?? 'The book return has been recorded.');
  }

  private toDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
  
  protected openLostForm(borrowingId: string): void {
    this.lostBorrowingId.set(borrowingId);
    this.paymentDueAt.set('');
    this.feedback.set('');
    this.cancelDamagedForm();
  }

  protected cancelLostForm(): void {
    this.lostBorrowingId.set(null);
    this.paymentDueAt.set('');
  }

  protected confirmLost(borrowingId: string): void {
    const deadline = this.paymentDueAt();

    if (!deadline) {
      this.feedback.set('Choose a payment deadline before confirming.');
      return;
    }

    const error = this.borrowingService.markLost(borrowingId, deadline);

    if (error) {
      this.feedback.set(error);
      return;
    }

    this.feedback.set('Book marked as lost. Replacement charge recorded.');
    this.cancelLostForm();
  }

  private readonly chargeService = inject(ChargeService);

  protected readonly memberCharges = computed(() =>
    [...this.chargeService.charges()].sort((a, b) =>
      b.issuedAt.localeCompare(a.issuedAt),
    ),
  );

  protected readonly chargeSearch = signal('');
  protected readonly chargeStatusFilter = signal<'all' | 'unpaid' | 'paid' | 'waived'>('all');
  protected readonly chargeReasonFilter = signal<'all' | MemberCharge['reason']>('all');
  protected readonly chargePage = signal(1);
  protected readonly chargePageSize = 5;
  protected readonly chargeDetailId = signal<string | null>(null);

  protected readonly filteredCharges = computed(() => {
    const query = this.chargeSearch().trim().toLowerCase();
    const status = this.chargeStatusFilter();
    const reason = this.chargeReasonFilter();

    return this.memberCharges().filter((charge) => {
      const matchesSearch =
        !query ||
        `${charge.id} ${this.memberName(charge.memberId)} ${this.bookTitle(charge.bookId)}`
          .toLowerCase()
          .includes(query);
      return (
        matchesSearch &&
        (status === 'all' || charge.status === status) &&
        (reason === 'all' || charge.reason === reason)
      );
    });
  });

  protected readonly chargePageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredCharges().length / this.chargePageSize)),
  );
  protected readonly currentChargePage = computed(() =>
    Math.min(this.chargePage(), this.chargePageCount()),
  );
  protected readonly visibleCharges = computed(() => {
    const start = (this.currentChargePage() - 1) * this.chargePageSize;
    return this.filteredCharges().slice(start, start + this.chargePageSize);
  });
  protected readonly chargeRangeStart = computed(() =>
    this.filteredCharges().length === 0
      ? 0
      : (this.currentChargePage() - 1) * this.chargePageSize + 1,
  );
  protected readonly chargeRangeEnd = computed(() =>
    Math.min(this.currentChargePage() * this.chargePageSize, this.filteredCharges().length),
  );

  protected setRepairAgeFilter(value: string): void {
    this.repairAgeFilter.set(value === 'recent' || value === 'older' ? value : 'all');
  }

  protected setChargeSearch(value: string): void {
    this.chargeSearch.set(value);
    this.chargePage.set(1);
  }

  protected setChargeStatusFilter(status: 'all' | 'unpaid' | 'paid' | 'waived'): void {
    this.chargeStatusFilter.set(status);
    this.chargePage.set(1);
  }

  protected setChargeReasonFilter(value: string): void {
    const reason =
      value === 'late-return' ||
      value === 'borrower-damaged-book' ||
      value === 'borrower-lost-book'
        ? value
        : 'all';
    this.chargeReasonFilter.set(reason);
    this.chargePage.set(1);
  }

  protected changeChargePage(delta: number): void {
    this.chargePage.set(
      Math.min(this.chargePageCount(), Math.max(1, this.currentChargePage() + delta)),
    );
  }

  protected toggleChargeDetails(chargeId: string): void {
    this.chargeDetailId.update((current) => current === chargeId ? null : chargeId);
  }

  protected chargeReasonLabel(charge: MemberCharge): string {
    if (charge.reason === 'late-return') return 'Late return fine';
    if (charge.reason === 'borrower-lost-book') return 'Lost-book replacement';
    const severity = charge.damageSeverity;
    return severity
      ? `${severity.charAt(0).toUpperCase()}${severity.slice(1)} damage`
      : 'Book damage';
  }

  protected exportCharges(): void {
    const columns = [
      'Charge ID', 'Member', 'Book', 'Reason', 'Issued',
      'Payment deadline', 'Amount (RM)', 'Status',
    ];
    const rows = this.filteredCharges().map((charge) => [
      charge.id,
      this.memberName(charge.memberId),
      this.bookTitle(charge.bookId),
      this.chargeReasonLabel(charge),
      charge.issuedAt,
      charge.paymentDueAt,
      charge.amount.toFixed(2),
      charge.status,
    ]);
    const csv = [columns, ...rows]
      .map((row) => row.map((value) => {
        const safe = /^\s*[=+@-]/.test(value) ? `'${value}` : value;
        return `"${safe.replaceAll('"', '""')}"`;
      }).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'member-charges.csv';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  protected readonly waiveChargeId = signal<string | null>(null);
  protected readonly waiverReason = signal('');

  protected recordPayment(chargeId: string): void {
  const charge = this.chargeService
    .charges()
    .find((item) => item.id === chargeId);

  if (!charge) {
    this.feedback.set('Charge record not found.');
    return;
  }

  const confirmed = window.confirm(
    `Confirm that RM ${charge.amount.toFixed(2)} has been received?`,
  );

  if (!confirmed) return;

  const error = this.chargeService.markPaid(chargeId);
    this.feedback.set(error ?? `Payment for ${chargeId} has been recorded.`);
  }

  protected openWaiverForm(chargeId: string): void {
    this.waiveChargeId.set(chargeId);
    this.waiverReason.set('');
    this.feedback.set('');
  }

  protected cancelWaiver(): void {
    this.waiveChargeId.set(null);
    this.waiverReason.set('');
  }

  protected confirmWaiver(chargeId: string): void {
    const error = this.chargeService.waiveCharge(
      chargeId,
      this.waiverReason(),
    );

    this.feedback.set(error ?? `Charge ${chargeId} has been waived.`);

    if (!error) {
      this.cancelWaiver();
    }
  }

  protected readText(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected openDamagedForm(borrowingId: string): void {
    this.cancelLostForm();
    this.damagedBorrowingId.set(borrowingId);
    this.damageNote.set('');
    this.damageSeverity.set('');
    this.damageResponsibility.set('');
    this.feedback.set('');
  }

  protected cancelDamagedForm(): void {
    this.damagedBorrowingId.set(null);
    this.damageNote.set('');
    this.damageSeverity.set('');
    this.damageResponsibility.set('');
  }

  protected confirmDamaged(borrowingId: string): void {
    const severity = this.damageSeverity();
    const responsibility = this.damageResponsibility();

    if (
      severity !== 'minor' &&
      severity !== 'moderate' &&
      severity !== 'severe'
    ) {
      this.feedback.set('Select the damage severity.');
      return;
    }

    if (responsibility !== 'yes' && responsibility !== 'no') {
      this.feedback.set('Choose whether the borrower is responsible.');
      return;
    }

    const error = this.borrowingService.markDamagedReturn(
      borrowingId,
      this.damageNote(),
      severity,
      responsibility === 'yes',
    );

    if (error) {
      this.feedback.set(error);
      return;
    }

    const inventoryResult =
      severity === 'minor'
        ? 'The copy is available again.'
        : severity === 'moderate'
          ? 'The copy is unavailable until repaired.'
          : 'The copy was removed from inventory.';

    this.cancelDamagedForm();
    this.feedback.set(
      `Damaged return recorded. ${inventoryResult}${
        responsibility === 'yes' ? ' A damage charge was created.' : ''
      }`,
    );
  }

  protected openRepairForm(borrowingId: string): void {
    this.cancelLostForm();
    this.cancelDamagedForm();
    this.repairBorrowingId.set(borrowingId);
    this.repairNote.set('');
    this.feedback.set('');
  }

  protected cancelRepairForm(): void {
    this.repairBorrowingId.set(null);
    this.repairNote.set('');
  }

  protected confirmRepair(borrowingId: string): void {
    const error = this.borrowingService.completeRepair(
      borrowingId,
      this.repairNote(),
    );

    if (error) {
      this.feedback.set(error);
      return;
    }

    this.cancelRepairForm();
    this.feedback.set('Repair recorded. The copy is available to borrow again.');
  }
}
