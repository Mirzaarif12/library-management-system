import { Component, DestroyRef, afterNextRender, computed, inject, signal, } from '@angular/core';
import type { Book } from '../../models/book';
import type { Borrowing } from '../../models/borrowing';
import type { Reservation } from '../../models/reservation';
import { BookService } from '../books/bookservice';
import { BorrowingService } from '../borrowings/borrowingservice';
import { MemberService } from '../members/memberservice';
import { ReservationService } from '../reservations/reservationservice';
import type { InventoryAdjustmentReason } from '../../models/inventory-adjustment';
import { InventoryService } from '../books/inventoryservice';
import type { MemberCharge } from '../../models/member-charge';
import { ChargeService } from '../charges/chargeservice';

type TrendInterval = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface Comparison {
  label: string;
  direction: 'up' | 'down' | 'same' | 'new';
}

interface TrendPoint {
  label: string;
  count: number;
}

interface CategoryCount {
  category: string;
  count: number;
  percent: number;
}

interface PopularBook {
  book: Book;
  borrowCount: number;
  percent: number;
}

interface ActivityRow {
  loan: Borrowing;
  member: string;
  book: string;
  category: string;
  status: 'Returned' | 'Returned damaged' | 'Overdue' | 'On loan' | 'Lost';
}

const DAY_MS = 86_400_000;
const PAGE_SIZE = 10;

function toDateString(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function dateOrdinal(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function ordinalDate(ordinal: number): string {
  return toDateString(new Date(ordinal * DAY_MS));
}

function monthStart(value: string): string {
  return value.slice(0, 8) + '01';
}

@Component({
  selector: 'app-reports',
  imports: [],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class Reports {
  private readonly bookService = inject(BookService);
  private readonly memberService = inject(MemberService);
  private readonly borrowingService = inject(BorrowingService);
  private readonly reservationService = inject(ReservationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inventoryService = inject(InventoryService);
  private readonly chargeService = inject(ChargeService);

  readonly today = toDateString(new Date());
  protected readonly startDate = signal(monthStart(this.today));
  protected readonly endDate = signal(this.today);
  protected readonly appliedStartDate = signal(monthStart(this.today));
  protected readonly appliedEndDate = signal(this.today);
  protected readonly formError = signal('');
  protected readonly trendInterval = signal<TrendInterval>('daily');
  protected readonly activitySearch = signal('');
  protected readonly activityPage = signal(1);

  protected readonly activeSection = signal('period-statistics-heading');

  protected readonly books = this.bookService.books;
  protected readonly members = this.memberService.members;
  protected readonly borrowings = this.borrowingService.borrowings;
  protected readonly reservations = this.reservationService.reservations;

  protected readonly periodBorrowings = computed(() =>
    this.borrowings().filter(
      (loan) =>
        loan.borrowedAt >= this.appliedStartDate() &&
        loan.borrowedAt <= this.appliedEndDate(),
    ),
  );

  protected readonly periodReservations = computed(() =>
    this.reservations().filter((reservation) => {
      const requestedDate = reservation.requestedAt.slice(0, 10);
      return (
        requestedDate >= this.appliedStartDate() &&
        requestedDate <= this.appliedEndDate()
      );
    }),
  );

  protected readonly overdueInPeriod = computed(() =>
    this.borrowings().filter((loan) => {
      const resolvedAt = loan.returnedAt ?? loan.lostAt;

      return (
        loan.dueAt >= this.appliedStartDate() &&
        loan.dueAt <= this.appliedEndDate() &&
        (!resolvedAt || resolvedAt > loan.dueAt)
      );
    }),
  );

  private readonly previousPeriodBounds = computed(() => {
    const start = dateOrdinal(this.appliedStartDate());
    const end = dateOrdinal(this.appliedEndDate());
    const periodLength = Math.max(1, end - start + 1);
    const previousEnd = start - 1;
    return {
      start: ordinalDate(previousEnd - periodLength + 1),
      end: ordinalDate(previousEnd),
    };
  });

  private readonly previousPeriodBorrowings = computed(() => {
    const bounds = this.previousPeriodBounds();
    return this.borrowings().filter(
      (loan) => loan.borrowedAt >= bounds.start && loan.borrowedAt <= bounds.end,
    );
  });

  private readonly previousPeriodReservations = computed(() => {
    const bounds = this.previousPeriodBounds();
    return this.reservations().filter((reservation) => {
      const requestedDate = reservation.requestedAt.slice(0, 10);
      return requestedDate >= bounds.start && requestedDate <= bounds.end;
    });
  });

  private readonly previousPeriodOverdues = computed(() => {
    const bounds = this.previousPeriodBounds();
    return this.borrowings().filter(
      (loan) =>
        this.borrowingService.isActiveLoan(loan) &&
        loan.dueAt >= bounds.start &&
        loan.dueAt <= bounds.end &&
        loan.dueAt < this.today,
    );
  });

  protected readonly periodStats = computed(() => {
    const borrowings = this.periodBorrowings();
    const previousBorrowings = this.previousPeriodBorrowings();
    const uniqueMembers = new Set(borrowings.map((loan) => loan.memberId)).size;
    const previousUniqueMembers = new Set(
      previousBorrowings.map((loan) => loan.memberId),
    ).size;
    const overdue = this.overdueInPeriod().length;
    const previousOverdue = this.previousPeriodOverdues().length;
    const reservations = this.periodReservations().length;
    const previousReservations = this.previousPeriodReservations().length;

    return {
      borrowings: {
        value: borrowings.length,
        comparison: this.compare(borrowings.length, previousBorrowings.length),
      },
      members: {
        value: uniqueMembers,
        comparison: this.compare(uniqueMembers, previousUniqueMembers),
      },
      overdue: {
        value: overdue,
        comparison: this.compare(overdue, previousOverdue),
      },
      reservations: {
        value: reservations,
        comparison: this.compare(reservations, previousReservations),
      },
    };
  });

  protected readonly trendPoints = computed(() => {
    const interval = this.trendInterval();
    const start = this.appliedStartDate();
    const end = this.appliedEndDate();
    const grouped = new Map<string, number>();
    const startOrdinal = dateOrdinal(start);
    const endOrdinal = dateOrdinal(end);

    for (const loan of this.periodBorrowings()) {
      const key = this.bucketKey(loan.borrowedAt, interval);
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }

    if (interval === 'daily') {
      for (let day = startOrdinal; day <= endOrdinal; day += 1) {
        const key = ordinalDate(day);
        if (!grouped.has(key)) grouped.set(key, 0);
      }
    } else if (interval === 'weekly') {
      let day = startOrdinal;
      while (day <= endOrdinal) {
        const weekStart = day - ((new Date(day * DAY_MS).getUTCDay() + 6) % 7);
        const key = ordinalDate(weekStart);
        if (!grouped.has(key)) grouped.set(key, 0);
        day = weekStart + 7;
      }
    } else if (interval === 'monthly') {
      const [startYear, startMonth] = start.split('-').map(Number);
      const [endYear, endMonth] = end.split('-').map(Number);
      let year = startYear;
      let month = startMonth;
      while (year < endYear || (year === endYear && month <= endMonth)) {
        const key = year + '-' + String(month).padStart(2, '0');
        if (!grouped.has(key)) grouped.set(key, 0);
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
    } else {
      const firstYear = Number(start.slice(0, 4));
      const lastYear = Number(end.slice(0, 4));
      for (let year = firstYear; year <= lastYear; year += 1) {
        const key = String(year);
        if (!grouped.has(key)) grouped.set(key, 0);
      }
    }

    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({
        label: this.formatBucketLabel(key, interval),
        count,
      }));
  });

  protected readonly trendMaximum = computed(() =>
    this.trendPoints().reduce((maximum, point) => Math.max(maximum, point.count), 1),
  );

  protected readonly categoryCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const loan of this.periodBorrowings()) {
      const book = this.books().find((item) => item.id === loan.bookId);
      if (book) counts.set(book.category, (counts.get(book.category) ?? 0) + 1);
    }

    const maximum = Math.max(1, ...counts.values());
    return [...counts.entries()]
      .map(([category, count]) => ({
        category,
        count,
        percent: (count / maximum) * 100,
      }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  });

  protected readonly periodPopularBooks = computed(() => {
    const counts = new Map<string, number>();
    for (const loan of this.periodBorrowings()) {
      counts.set(loan.bookId, (counts.get(loan.bookId) ?? 0) + 1);
    }

    const ranked = [...counts.entries()]
      .map(([bookId, borrowCount]) => ({
        book: this.books().find((book) => book.id === bookId),
        borrowCount,
      }))
      .filter(
        (item): item is { book: Book; borrowCount: number } =>
          item.book !== undefined,
      )
      .sort((a, b) => b.borrowCount - a.borrowCount || a.book.title.localeCompare(b.book.title))
      .slice(0, 5);
    const maximum = Math.max(1, ...ranked.map((item) => item.borrowCount));
    return ranked.map((item) => ({
      ...item,
      percent: (item.borrowCount / maximum) * 100,
    }));
  });

  protected readonly activityRows = computed<ActivityRow[]>(() => {
    const query = this.activitySearch().trim().toLowerCase();
    return [...this.periodBorrowings()]
      .sort((a, b) => b.borrowedAt.localeCompare(a.borrowedAt) || b.id.localeCompare(a.id))
      .map((loan) => {
        const member = this.members().find((item) => item.id === loan.memberId);
        const book = this.books().find((item) => item.id === loan.bookId);
        const status: ActivityRow['status'] =
          loan.lostAt != null
            ? 'Lost'
            : loan.returnedAt
              ? loan.returnCondition === 'damaged'
                ? 'Returned damaged'
                : 'Returned'
              : loan.dueAt < this.today
                ? 'Overdue'
                : 'On loan';
        return {
          loan,
          member: member?.name ?? 'Unknown member',
          book: book?.title ?? 'Unknown book',
          category: book?.category ?? 'Unknown category',
          status,
        };
      })
      .filter((row) =>
        [
          row.loan.id,
          row.member,
          row.book,
          row.category,
          row.status,
          row.loan.borrowedAt,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query),
      );
  });

  protected readonly activityPageCount = computed(() =>
    Math.max(1, Math.ceil(this.activityRows().length / PAGE_SIZE)),
  );

  protected readonly pagedActivityRows = computed(() => {
    const start = (this.activityPage() - 1) * PAGE_SIZE;
    return this.activityRows().slice(start, start + PAGE_SIZE);
  });

  protected readonly activityPageNumbers = computed(() => {
    const total = this.activityPageCount();
    const first = Math.max(1, Math.min(this.activityPage() - 2, total - 4));
    const last = Math.min(total, first + 4);
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  });

  protected readonly overdueLoans = computed(() =>
    this.borrowings()
      .filter(
        (loan) =>
          this.borrowingService.isActiveLoan(loan) &&
          loan.dueAt < this.today,
      )
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
  );

  protected readonly mostBorrowedBooks = computed(() => {
    const counts = new Map<string, number>();
    for (const loan of this.borrowings()) {
      counts.set(loan.bookId, (counts.get(loan.bookId) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([bookId, borrowCount]) => ({
        book: this.books().find((book) => book.id === bookId),
        borrowCount,
      }))
      .filter(
        (item): item is { book: Book; borrowCount: number } =>
          item.book !== undefined,
      )
      .sort((a, b) => b.borrowCount - a.borrowCount || a.book.title.localeCompare(b.book.title));
  });

  protected readonly reservationHistory = computed(() =>
    [...this.reservations()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
  );

  protected readonly borrowingHistory = computed(() =>
    [...this.borrowings()].sort(
      (a, b) => b.borrowedAt.localeCompare(a.borrowedAt) || b.id.localeCompare(a.id),
    ),
  );

  constructor() {
    afterNextRender(() => {
      const sectionIds = [
        'period-statistics-heading',
        'borrowing-trend-heading',
        'category-breakdown-heading',
        'period-popular-books-heading',
        'borrowing-activity-heading',
        'reservation-history-heading',
        'overdue-heading',
        'popular-books-heading',
        'circulation-history-heading',
        'inventory-adjustments-heading',
      ];
      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible.length > 0) {
            this.activeSection.set((visible[0].target as HTMLElement).id);
          }
        },
        { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
      );

      for (const id of sectionIds) {
        const heading = document.getElementById(id);
        if (heading) observer.observe(heading);
      }
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected readInput(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected generateReport(): void {
    if (!this.startDate() || !this.endDate()) {
      this.formError.set('Choose both a start date and an end date.');
      return;
    }
    if (this.startDate() > this.endDate()) {
      this.formError.set('The start date must be on or before the end date.');
      return;
    }

    this.formError.set('');
    this.appliedStartDate.set(this.startDate());
    this.appliedEndDate.set(this.endDate());
    this.activityPage.set(1);
  }

  protected setTrendInterval(interval: TrendInterval): void {
    this.trendInterval.set(interval);
  }

  protected setActivitySearch(event: Event): void {
    this.activitySearch.set((event.target as HTMLInputElement).value);
    this.activityPage.set(1);
  }

  protected setActivityPage(page: number): void {
    this.activityPage.set(Math.min(this.activityPageCount(), Math.max(1, page)));
  }

  protected exportActivityCsv(): void {
    const header = ['Loan ID', 'Member', 'Book', 'Category', 'Borrow date', 'Due date', 'Returned date', 'Status', 'Fine (RM)'];
    const rows = this.activityRows().map((row) => [
      row.loan.id,
      row.member,
      row.book,
      row.category,
      row.loan.borrowedAt,
      row.loan.dueAt,
      row.loan.returnedAt ?? '',
      row.status,
      this.borrowingService.fineAmount(row.loan).toFixed(2),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => this.csvCell(String(value))).join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'borrowing-activity-' + this.appliedStartDate() + '-to-' + this.appliedEndDate() + '.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  protected memberName(memberId: string): string {
    return this.members().find((member) => member.id === memberId)?.name ?? 'Unknown member';
  }

  protected bookTitle(bookId: string): string {
    return this.books().find((book) => book.id === bookId)?.title ?? 'Unknown book';
  }

  protected fineAmount(loan: Borrowing): number {
    return this.borrowingService.fineAmount(loan);
  }

  protected comparisonText(comparison: Comparison): string {
    return comparison.label;
  }

  private compare(current: number, previous: number): Comparison {
    if (previous === 0) {
      return current === 0
        ? { label: 'No change from previous period', direction: 'same' }
        : { label: 'New this period', direction: 'new' };
    }

    const percentage = Math.round(((current - previous) / previous) * 100);
    if (percentage === 0) {
      return { label: 'No change from previous period', direction: 'same' };
    }
    return {
      label: (percentage > 0 ? '↑ ' : '↓ ') + Math.abs(percentage) + '% vs previous period',
      direction: percentage > 0 ? 'up' : 'down',
    };
  }

  private bucketKey(value: string, interval: TrendInterval): string {
    if (interval === 'daily') return value;
    if (interval === 'monthly') return value.slice(0, 7);
    if (interval === 'yearly') return value.slice(0, 4);

    const ordinal = dateOrdinal(value);
    const weekday = new Date(ordinal * DAY_MS).getUTCDay();
    return ordinalDate(ordinal - ((weekday + 6) % 7));
  }

  private formatBucketLabel(key: string, interval: TrendInterval): string {
    if (interval === 'yearly') return key;
    if (interval === 'monthly') {
      const [year, month] = key.split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      });
    }
    const date = interval === 'weekly' ? key : key;
    return new Date(date + 'T00:00:00Z').toLocaleDateString('en', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  private csvCell(value: string): string {
    const safeValue = /^[=+\-@]/.test(value) ? "'" + value : value;
    return '"' + safeValue.replaceAll('"', '""') + '"';
  }

  protected readonly inventoryAdjustmentHistory = computed(() =>
    [...this.inventoryService.adjustments()].sort(
      (a, b) => b.adjustedAt.localeCompare(a.adjustedAt),
    ),
  );

  protected adjustmentReasonLabel(reason: InventoryAdjustmentReason): string {
    const labels: Record<InventoryAdjustmentReason, string> = {
      purchase: 'Purchase',
      donation: 'Donation',
      missing: 'Missing in library',
      damaged: 'Damaged',
      'borrower-lost': 'Lost by borrower',
      'repair-completed': 'Repair completed',
    };

    return labels[reason];

  }

  protected readonly replacementChargeHistory = computed(() =>
      [...this.chargeService.charges()].sort((a, b) =>
        b.issuedAt.localeCompare(a.issuedAt),
      ),
    );

    protected readonly outstandingReplacementChargeTotal = computed(() =>
      this.chargeService
        .charges()
        .filter((charge) => charge.status === 'unpaid')
        .reduce((total, charge) => total + charge.amount, 0),
    );

    protected replacementChargeStatus(charge: MemberCharge): string {
      if (charge.status === 'unpaid' && charge.paymentDueAt < this.today) {
        return 'Payment overdue';
      }

      return charge.status.charAt(0).toUpperCase() + charge.status.slice(1);
    }
  protected exportMemberChargesCsv(): void {
    const header = [
      'Charge ID',
      'Member',
      'Book',
      'Reason',
      'Issued date',
      'Payment deadline',
      'Amount (RM)',
      'Status',
      'Paid date',
      'Waiver reason',
    ];

    const rows = this.replacementChargeHistory().map((charge) => [
      charge.id,
      this.memberName(charge.memberId),
      this.bookTitle(charge.bookId),
      charge.reason === 'late-return'
        ? 'Late return fine'
        : 'Lost-book replacement',
      charge.issuedAt,
      charge.paymentDueAt,
      charge.amount.toFixed(2),
      this.replacementChargeStatus(charge),
      charge.paidAt ?? '',
      charge.waiverReason ?? '',
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((value) => this.csvCell(value)).join(','))
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `member-charges-${this.today}.csv`;
    link.click();

    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }  

  protected exportInventoryAdjustmentsCsv(): void {
    const header = [
      'Adjustment ID',
      'Date',
      'Book',
      'Reason',
      'Quantity',
      'Total copies change',
      'Available copies change',
      'Staff',
      'Loan ID',
      'Note',
    ];

    const rows = this.inventoryAdjustmentHistory().map((adjustment) => [
      adjustment.id,
      adjustment.adjustedAt,
      this.bookTitle(adjustment.bookId),
      this.adjustmentReasonLabel(adjustment.reason),
      String(adjustment.quantity),
      String(adjustment.totalCopiesChange),
      String(adjustment.availableCopiesChange),
      adjustment.adjustedBy,
      adjustment.borrowingId ?? '',
      adjustment.note,
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((value) => this.csvCell(value)).join(','))
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `inventory-adjustments-${this.today}.csv`;
    link.click();

    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  protected exportReservationHistoryCsv(): void {
    const header = [
      'Reservation ID',
      'Member',
      'Book',
      'Requested',
      'Ready',
      'Pickup deadline',
      'Collected',
      'Status',
    ];

    const rows = this.reservationHistory().map((reservation) => [
      reservation.id,
      this.memberName(reservation.memberId),
      this.bookTitle(reservation.bookId),
      reservation.requestedAt,
      reservation.readyAt ?? '',
      reservation.pickupDeadline ?? '',
      reservation.collectedAt ?? '',
      reservation.status,
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((value) => this.csvCell(value)).join(','))
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `reservation-history-${this.today}.csv`;
    link.click();

    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

}