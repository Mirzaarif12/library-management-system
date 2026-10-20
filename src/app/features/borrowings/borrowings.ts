import { Component, computed, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BookService } from '../books/bookservice';
import { MemberService } from '../members/memberservice';
import { BorrowingService } from './borrowingservice';

@Component({
  imports: [NgOptimizedImage, ReactiveFormsModule],
  selector: 'app-borrowings',
  styleUrl: './borrowings.css',
  templateUrl: './borrowings.html',
})
export class Borrowings {
  private readonly borrowingService = inject(BorrowingService);
  private readonly bookService = inject(BookService);
  private readonly memberService = inject(MemberService);

  protected readonly members = this.memberService.members;
  protected readonly availableBooks = computed(() =>
    this.bookService.books().filter((book) => book.availableCopies > 0),
  );

  protected readonly activeLoans = computed(() =>
    this.borrowingService
      .borrowings()
      .filter((loan) => this.borrowingService.isActiveLoan(loan)),
  );

  protected readonly loanSearch = signal('');
  protected readonly loanStatusFilter = signal<'all' | 'on-loan' | 'due-soon' | 'overdue'>('all');
  protected readonly filteredLoans = computed(() => {
    const query = this.loanSearch().trim().toLowerCase();
    const status = this.loanStatusFilter();

    return this.activeLoans().filter((loan) => {
      const searchableText = [
        loan.id,
        loan.memberId,
        this.memberName(loan.memberId),
        loan.bookId,
        this.bookTitle(loan.bookId),
      ].join(' ').toLowerCase();
      const daysRemaining = this.daysUntilDue(loan.dueAt);
      const matchesStatus =
        status === 'all' ||
        (status === 'on-loan' && daysRemaining >= 0) ||
        (status === 'due-soon' && daysRemaining >= 0 && daysRemaining <= 3) ||
        (status === 'overdue' && daysRemaining < 0);

      return (!query || searchableText.includes(query)) && matchesStatus;
    });
  });

  protected readonly feedback = signal('');

  protected readonly loanForm = new FormGroup({
    memberId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    bookId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  protected readonly today = this.toDateString(new Date());

  protected submitBorrowing(): void {
    this.feedback.set('');

    if (this.loanForm.invalid) {
      this.loanForm.markAllAsTouched();
      return;
    }

    const { memberId, bookId } = this.loanForm.getRawValue();
    const error = this.borrowingService.borrowBook(memberId, bookId);

    if (error) {
      this.feedback.set(error);
      return;
    }

    this.feedback.set('The book has been checked out.');
    this.loanForm.reset();
  }

  protected memberName(memberId: string): string {
    return this.members().find((member) => member.id === memberId)?.name ?? 'Unknown member';
  }

  protected bookTitle(bookId: string): string {
    return this.bookService.books().find((book) => book.id === bookId)?.title ?? 'Unknown book';
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

  protected setLoanSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.loanSearch.set(target.value);
  }

  protected setLoanStatusFilter(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const value = target.value;
    this.loanStatusFilter.set(
      value === 'on-loan' || value === 'due-soon' || value === 'overdue' ? value : 'all',
    );
  }

  private toDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
