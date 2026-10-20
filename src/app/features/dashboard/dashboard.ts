import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/authservice';
import { BookService } from '../books/bookservice';
import { BorrowingService } from '../borrowings/borrowingservice';
import { MemberService } from '../members/memberservice';
import { ReservationService } from '../reservations/reservationservice';
import { RouterLink } from '@angular/router';
import { ChargeService } from '../charges/chargeservice';
import { DemoDataService } from './demo-data.service';

@Component({
  imports: [RouterLink],
  selector: 'app-dashboard',
  styleUrl: './dashboard.css',
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly authService = inject(AuthService);
  private readonly bookService = inject(BookService);
  private readonly borrowingService = inject(BorrowingService);
  private readonly memberService = inject(MemberService);
  private readonly reservationService = inject(ReservationService);
  private readonly chargeService = inject(ChargeService);
  protected readonly demoDataService = inject(DemoDataService);
  protected readonly demoDataMessage = signal('');

  protected readonly isAdmin = computed(
    () => this.authService.currentUser()?.role === 'admin',
  );

  protected loadDemoData(): void {
    const error = this.demoDataService.load();
    this.demoDataMessage.set(
      error ?? 'Demo books and activity were added to this browser.',
    );
  }

  protected readonly isMember = computed(
    () => this.authService.currentUser()?.role === 'member',
  );

  protected readonly canViewStaffSummary = computed(() => {
    const role = this.authService.currentUser()?.role;
    return role === 'admin' || role === 'staff';
  });

  protected readonly totalBookTitles = computed(
    () => this.bookService.books().length,
  );

  protected readonly totalCopies = computed(() =>
    this.bookService.books().reduce((total, book) => total + book.totalCopies, 0),
  );

  protected readonly availableCopies = computed(() =>
    this.bookService.books().reduce((total, book) => total + book.availableCopies, 0),
  );

  protected readonly activeLoans = computed(
    () =>
      this.borrowingService
        .borrowings()
        .filter((loan) => this.borrowingService.isActiveLoan(loan)).length,
  );

protected readonly overdueLoans = computed(
  () =>
    this.borrowingService
      .borrowings()
      .filter(
        (loan) =>
          this.borrowingService.isActiveLoan(loan) &&
          loan.dueAt < this.today,
      ).length,
);

  protected readonly totalMembers = computed(
    () => this.memberService.members().length,
  );

  protected readonly suspendedMembers = computed(
    () => this.memberService.members().filter((member) => member.status === 'suspended').length,
  );

  protected readonly estimatedFines = computed(() => {
    const lateFineEstimate = this.borrowingService
      .borrowings()
      .filter((loan) => this.borrowingService.isActiveLoan(loan))
      .reduce(
        (total, loan) => total + this.borrowingService.fineAmount(loan),
        0,
      );

    return lateFineEstimate + this.unpaidReplacementCharges();
  });

  protected readonly waitingReservations = computed(
    () => this.reservationService.reservations().filter((item) => item.status === 'waiting').length,
  );

  protected readonly readyReservations = computed(
    () => this.reservationService.reservations().filter((item) => item.status === 'ready').length,
  );

  protected readonly collectedReservations = computed(
    () => this.reservationService.reservations().filter((item) => item.status === 'collected').length,
  );

  protected readonly cancelledReservations = computed(
    () => this.reservationService.reservations().filter((item) => item.status === 'cancelled').length,
  );

  protected readonly expiredReservations = computed(
    () => this.reservationService.reservations().filter((item) => item.status === 'expired').length,
  );

  protected readonly recentReservations = computed(() =>
    [...this.reservationService.reservations()]
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
      .slice(0, 5),
  );

  protected readonly myActiveLoans = computed(() => {
    const memberId = this.authService.currentUser()?.memberId;
    if (!memberId) return 0;

    return this.borrowingService.borrowings().filter(
      (loan) => loan.memberId === memberId && this.borrowingService.isActiveLoan(loan) && loan.dueAt >= this.today,
    ).length;
  });

  protected readonly myOverdueLoans = computed(() => {
    const memberId = this.authService.currentUser()?.memberId;
    if (!memberId) return 0;

    return this.borrowingService.borrowings().filter(
      (loan) =>
        loan.memberId === memberId &&
        this.borrowingService.isActiveLoan(loan) &&
        loan.dueAt < this.today,
    ).length;
  });

  protected readonly myReadyPickups = computed(() => {
    const memberId = this.authService.currentUser()?.memberId;
    if (!memberId) return 0;

    return this.reservationService.reservations().filter(
      (item) => item.memberId === memberId && item.status === 'ready',
    ).length;
  });

  protected readonly today = this.toDateString(new Date());
  protected readonly todayLabel = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  private toDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  protected memberName(memberId: string): string {
    return this.memberService.members().find((member) => member.id === memberId)?.name ?? 'Unknown member';
  }

  protected bookTitle(bookId: string): string {
    return this.bookService.books().find((book) => book.id === bookId)?.title ?? 'Unknown book';
  }

  protected shortDate(value: string | null): string {
    return value ? value.slice(0, 10) : '—';
  }

    protected readonly dueSoonCutoff = this.dateAfterDays(3);
    protected readonly myDueSoonLoans = computed(() => {
      const memberId = this.authService.currentUser()?.memberId;
      if (!memberId) return 0;

      return this.borrowingService.borrowings().filter(
        (loan) =>
          loan.memberId === memberId &&
          this.borrowingService.isActiveLoan(loan) &&
          loan.dueAt >= this.today &&
          loan.dueAt <= this.dueSoonCutoff,
      ).length;
    });

      private dateAfterDays(days: number): string {
        const date = new Date();
        date.setDate(date.getDate() + days);

        return this.toDateString(date);
      }

      protected readonly unpaidReplacementCharges = computed(() =>
        this.chargeService
          .charges()
          .filter((charge) => charge.status === 'unpaid')
          .reduce((total, charge) => total + charge.amount, 0),
      );

      protected readonly myUnpaidReplacementCharges = computed(() => {
          const memberId = this.authService.currentUser()?.memberId;
          if (!memberId) return 0;

          return this.chargeService
            .charges()
            .filter((charge) => charge.memberId === memberId && charge.status === 'unpaid')
            .reduce((total, charge) => total + charge.amount, 0);
        });

        protected readonly myOverdueReplacementCharges = computed(() => {
          const memberId = this.authService.currentUser()?.memberId;
          if (!memberId) return 0;

          return this.chargeService.charges().filter(
            (charge) =>
              charge.memberId === memberId &&
              charge.status === 'unpaid' &&
              charge.paymentDueAt < this.today,
          ).length;
        });

        protected readonly overdueReplacementCharges = computed(() =>
          this.chargeService.charges().filter(
            (charge) =>
              charge.status === 'unpaid' &&
              charge.paymentDueAt < this.today,
          ).length,
        );

      
    }
