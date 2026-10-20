import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Book } from '../../models/book';
import type { Borrowing } from '../../models/borrowing';
import type { Member } from '../../models/member';
import type { Reservation } from '../../models/reservation';
import type { User } from '../../models/user';
import { AuthService } from '../auth/authservice';
import { BookService } from '../books/bookservice';
import { InventoryService } from '../books/inventoryservice';
import { ChargeService } from '../charges/chargeservice';
import { Dashboard } from '../dashboard/dashboard';
import { MyLoans } from '../member-portal/my-loans/my-loans';
import { MemberService } from '../members/memberservice';
import { ReservationService } from '../reservations/reservationservice';
import { Returns } from '../returns/returns';
import { BorrowingService } from './borrowingservice';

@Component({ template: '' })
class RenderHost {}

function loan(overrides: Partial<Borrowing> = {}): Borrowing {
  return {
    id: 'BR-001',
    memberId: 'MB-001',
    bookId: 'BK-001',
    borrowedAt: '2026-09-19',
    dueAt: '2026-10-03',
    returnedAt: null,
    lostAt: null,
    ...overrides,
  };
}

function buttonWithText(element: HTMLElement, text: string): HTMLButtonElement {
  const button = [...element.querySelectorAll<HTMLButtonElement>('button')]
    .find((item) => item.textContent?.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

describe('late-return workflow', () => {
  let borrowingService: BorrowingService;
  let chargeService: ChargeService;
  let bookService: BookService;
  let memberService: MemberService;
  const currentUser = signal<User | null>(null);

  function initializeServices(): void {
    TestBed.configureTestingModule({
      imports: [RenderHost, Returns, MyLoans, Dashboard],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser } },
        { provide: InventoryService, useValue: { recordAdjustment: vi.fn(() => null) } },
        { provide: ReservationService, useValue: { reservations: signal<Reservation[]>([]) } },
      ],
    });
    borrowingService = TestBed.inject(BorrowingService);
    chargeService = TestBed.inject(ChargeService);
    bookService = TestBed.inject(BookService);
    memberService = TestBed.inject(MemberService);
    const host = TestBed.createComponent(RenderHost);
    host.detectChanges();
    TestBed.tick();
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 6, 12));
    localStorage.clear();
    currentUser.set({ id: 'US-001', email: 'member@example.test', role: 'member', memberId: 'MB-001' });

    const books: Book[] = [{
      id: 'BK-001', isbn: '9780465050659', title: 'Test book', author: 'Test author',
      category: 'Design', publisher: 'Test publisher', publicationYear: 2026,
      replacementCost: 30, totalCopies: 10, availableCopies: 9,
    }];
    const members: Member[] = ['MB-001', 'MB-002'].map((id) => ({
      id, icNo: `TEST-${id}`, name: id, email: `${id}@example.test`, phone: '0123456789',
      registrationDate: '2026-09-01', status: 'active', borrowingLimit: 5,
    }));
    localStorage.setItem('library-books', JSON.stringify(books));
    localStorage.setItem('library-members', JSON.stringify(members));
    localStorage.setItem('library-borrowings', '[]');
    localStorage.setItem('library-charges', '[]');
    initializeServices();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('counts the selected member only when the library has more than five active loans', () => {
    borrowingService.borrowings.set([
      loan(),
      ...Array.from({ length: 5 }, (_, index) => loan({ id: `BR-${index + 2}`, memberId: 'MB-002' })),
    ]);

    expect(borrowingService.borrowBook('MB-001', 'BK-001')).toBeNull();
    expect(borrowingService.borrowings().filter(
      (item) => item.memberId === 'MB-001' && borrowingService.isActiveLoan(item),
    )).toHaveLength(2);
  });

  it('honors an edited member limit and excludes returned and lost loans', () => {
    memberService.members.update((members) => members.map(
      (member) => member.id === 'MB-001' ? { ...member, borrowingLimit: 2 } : member,
    ));
    borrowingService.borrowings.set([
      loan(),
      loan({ id: 'BR-002', returnedAt: '2026-10-02' }),
      loan({ id: 'BR-003', lostAt: '2026-10-02' }),
    ]);

    expect(borrowingService.borrowBook('MB-001', 'BK-001')).toBeNull();
    expect(borrowingService.borrowBook('MB-001', 'BK-001')).toContain('limit of 2 books');
  });

  it('restores one available copy without charging for a return on the due date', () => {
    borrowingService.borrowings.set([loan({ dueAt: '2026-10-06' })]);

    expect(borrowingService.returnBook('BR-001')).toBeNull();
    expect(bookService.books()[0].availableCopies).toBe(10);
    expect(chargeService.charges()).toHaveLength(0);
    expect(borrowingService.borrowings()[0].returnedAt).toBe('2026-10-06');
  });

  it('saves a final RM 3 charge for a three-day late return, without charging twice', () => {
    borrowingService.borrowings.set([loan()]);

    expect(borrowingService.returnBook('BR-001')).toBeNull();
    expect(chargeService.charges()).toHaveLength(1);
    expect(chargeService.charges()[0]).toMatchObject({
      id: 'CH-0001', memberId: 'MB-001', borrowingId: 'BR-001', bookId: 'BK-001',
      reason: 'late-return', amount: 3, issuedAt: '2026-10-06',
      paymentDueAt: '2026-12-05', status: 'unpaid', paidAt: null,
    });
    expect(borrowingService.isActiveLoan(borrowingService.borrowings()[0])).toBe(false);

    expect(borrowingService.returnBook('BR-001')).toContain('already been returned');
    expect(chargeService.charges()).toHaveLength(1);
    expect(bookService.books()[0].availableCopies).toBe(10);

    vi.setSystemTime(new Date(2026, 9, 20, 12));
    expect(borrowingService.fineAmount(borrowingService.borrowings()[0])).toBe(3);
    expect(chargeService.charges()[0].amount).toBe(3);
  });

  it('does not restore stock or add a charge when a lost loan is returned', () => {
    borrowingService.borrowings.set([loan({ lostAt: '2026-10-05' })]);

    expect(borrowingService.returnBook('BR-001')).toContain('marked as lost');
    expect(bookService.books()[0].availableCopies).toBe(9);
    expect(chargeService.charges()).toHaveLength(0);
  });

  it('updates the staff payment table, member balance, and Dashboard together', () => {
    borrowingService.borrowings.set([loan()]);
    const returns = TestBed.createComponent(Returns);
    returns.detectChanges();
    const staffElement = returns.nativeElement as HTMLElement;
    buttonWithText(staffElement, 'Record return').click();
    TestBed.tick();
    expect(staffElement.textContent).toContain('Late return fine');
    expect(staffElement.textContent).toContain('CH-0001');

    const myLoans = TestBed.createComponent(MyLoans);
    const dashboard = TestBed.createComponent(Dashboard);
    TestBed.tick();
    const memberElement = myLoans.nativeElement as HTMLElement;
    const dashboardElement = dashboard.nativeElement as HTMLElement;
    expect(memberElement.querySelector('.charge-summary')?.textContent).toContain('RM 3.00');
    expect(dashboardElement.textContent).toContain('RM 3.00');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    buttonWithText(staffElement, 'Record payment').click();
    TestBed.tick();
    expect(chargeService.charges()[0]).toMatchObject({ status: 'paid', paidAt: '2026-10-06' });
    expect(memberElement.querySelector('.charge-status')?.textContent?.trim()).toBe('Paid');
    expect(memberElement.querySelector('.charge-summary')?.textContent).toContain('RM 0.00');
    expect(dashboardElement.textContent).toContain('RM 0.00');
    expect(staffElement.textContent).toContain('Paid');
    expect(chargeService.markPaid('CH-0001')).toContain('Only unpaid charges');

    borrowingService.borrowings.update((loans) => [...loans, loan({
      id: 'BR-002', dueAt: '2026-09-01', lostAt: '2026-10-05',
    })]);
    currentUser.set({ id: 'US-ADMIN', email: 'admin@example.test', role: 'admin' });
    TestBed.tick();
    const fineCard = [...dashboardElement.querySelectorAll('article')]
      .find((card) => card.querySelector('h4')?.textContent?.includes('Estimated fines'));
    expect(fineCard?.textContent).toContain('RM 0.00');
  });

  it('keeps the returned loan, stock count, and paid charge after reloading services', () => {
    borrowingService.borrowings.set([loan()]);
    expect(borrowingService.returnBook('BR-001')).toBeNull();
    expect(chargeService.markPaid('CH-0001')).toBeNull();
    TestBed.tick();

    TestBed.resetTestingModule();
    initializeServices();

    expect(borrowingService.borrowings()[0].returnedAt).toBe('2026-10-06');
    expect(bookService.books()[0].availableCopies).toBe(10);
    expect(chargeService.charges()).toHaveLength(1);
    expect(chargeService.charges()[0]).toMatchObject({ id: 'CH-0001', amount: 3, status: 'paid' });
  });

  it('starts normal charge numbering after legacy timestamp IDs', () => {
    chargeService.createReplacementCharge('MB-001', 'BR-LEGACY', 'BK-001', 30, '2026-12-05');
    chargeService.charges.update((charges) => charges.map(
      (charge) => ({ ...charge, id: 'CH-1790000000000' }),
    ));
    borrowingService.borrowings.set([loan()]);

    expect(borrowingService.returnBook('BR-001')).toBeNull();
    expect(chargeService.charges().map((charge) => charge.id))
      .toEqual(['CH-1790000000000', 'CH-0001']);

    chargeService.createLateReturnCharge('MB-002', 'BR-002', 'BK-001', 1, '2026-12-05');
    expect(chargeService.charges()[2].id).toBe('CH-0002');
  });
});
