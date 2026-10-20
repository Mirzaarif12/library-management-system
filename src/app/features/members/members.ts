import { Component, inject, signal, computed } from '@angular/core';
import { MemberService } from './memberservice';
import type { Member } from '../../models/member';
import { BorrowingService } from '../borrowings/borrowingservice';

@Component({
  imports: [],
  selector: 'app-members',
  styleUrl: './members.css',
  templateUrl: './members.html',
})
export class Members {
 protected readonly members = inject(MemberService).members;
 protected readonly showMemberForm = signal(false);
 protected readonly memberSearch = signal('');
 protected readonly statusFilter = signal<'all' | Member['status']>('all');
 protected readonly memberPage = signal(1);
 protected readonly memberPageSize = 6;

  protected readonly newName = signal('');
  protected readonly newIcNo = signal('');
  protected readonly newEmail = signal('');
  protected readonly newPhone = signal('');
  protected readonly newBorrowingLimit = signal(5);

  // Method to read input value from an event
  protected readInput(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement || target instanceof HTMLSelectElement
      ? target.value
      : '';
  }

  protected setBorrowingLimit(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.newBorrowingLimit.set(target.valueAsNumber);
    }
  }

  protected setNewStatus(event: Event): void {
    const value = this.readInput(event);
    if (value === 'active' || value === 'suspended') this.newStatus.set(value);
  }

  protected readonly totalMembers = computed(() => this.members().length);
  protected readonly activeMembers = computed(() =>
    this.members().filter((member) => member.status === 'active').length,
  );
  protected readonly suspendedMembers = computed(() =>
    this.members().filter((member) => member.status === 'suspended').length,
  );
  protected readonly averageBorrowing = computed(() => {
    const active = this.members().filter((member) => member.status === 'active');
    if (active.length === 0) return { borrowed: '0.0', limit: '0' };

    const borrowed = active.reduce(
      (total, member) => total + (this.activeLoanCounts().get(member.id) ?? 0),
      0,
    ) / active.length;
    const limit = active.reduce(
      (total, member) => total + member.borrowingLimit,
      0,
    ) / active.length;

    return {
      borrowed: borrowed.toFixed(1),
      limit: Number.isInteger(limit) ? String(limit) : limit.toFixed(1),
    };
  });

  protected readonly filteredMembers = computed(() => {
    const query = this.memberSearch().trim().toLowerCase();
    const status = this.statusFilter();

    return this.members().filter((member) => {
      const searchable = [
        member.id,
        member.icNo,
        member.name,
        member.email,
        member.phone,
      ].join(' ').toLowerCase();
      return (status === 'all' || member.status === status) &&
        (!query || searchable.includes(query));
    });
  });
  protected readonly memberPageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredMembers().length / this.memberPageSize)),
  );
  protected readonly currentMemberPage = computed(() =>
    Math.min(this.memberPage(), this.memberPageCount()),
  );
  protected readonly memberPageNumbers = computed(() => {
    const count = this.memberPageCount();
    const start = Math.max(1, Math.min(this.currentMemberPage() - 2, count - 4));
    return Array.from({ length: Math.min(5, count - start + 1) }, (_, index) => start + index);
  });
  protected readonly visibleMembers = computed(() => {
    const start = (this.currentMemberPage() - 1) * this.memberPageSize;
    return this.filteredMembers().slice(start, start + this.memberPageSize);
  });
  protected readonly memberRangeStart = computed(() =>
    this.filteredMembers().length === 0
      ? 0
      : (this.currentMemberPage() - 1) * this.memberPageSize + 1,
  );
  protected readonly memberRangeEnd = computed(() =>
    Math.min(this.currentMemberPage() * this.memberPageSize, this.filteredMembers().length),
  );

  protected setMemberSearch(event: Event): void {
    this.memberSearch.set(this.readInput(event));
    this.memberPage.set(1);
  }

  protected setStatusFilter(event: Event): void {
    const value = this.readInput(event);
    this.statusFilter.set(value === 'active' || value === 'suspended' ? value : 'all');
    this.memberPage.set(1);
  }

  protected changeMemberPage(delta: number): void {
    this.memberPage.set(
      Math.min(this.memberPageCount(), Math.max(1, this.currentMemberPage() + delta)),
    );
  }

  protected goToMemberPage(page: number): void {
    this.memberPage.set(Math.min(this.memberPageCount(), Math.max(1, page)));
  }

  protected memberInitial(member: Member): string {
    return member.name.trim().charAt(0).toUpperCase() || '?';
  }

  protected borrowedPercent(member: Member): number {
    if (member.borrowingLimit <= 0) return 0;
    return Math.min(
      100,
      ((this.activeLoanCounts().get(member.id) ?? 0) / member.borrowingLimit) * 100,
    );
  }

  protected toggleMemberForm(): void {
    if (this.showMemberForm()) {
      this.closeMemberForm();
      return;
    }
    this.showMemberForm.set(true);
  }

  protected closeMemberForm(): void {
    this.newName.set('');
    this.newIcNo.set('');
    this.newEmail.set('');
    this.newPhone.set('');
    this.newBorrowingLimit.set(5);
    this.newStatus.set('active');
    this.selectedMemberId.set(null);
    this.showMemberForm.set(false);
  }

  protected exportMembers(): void {
    const columns = ['Member ID', 'IC number', 'Name', 'Email', 'Phone', 'Status', 'Borrowed', 'Limit', 'Join date'];
    const rows = this.filteredMembers().map((member) => [
      member.id,
      member.icNo,
      member.name,
      member.email,
      member.phone,
      member.status,
      String(this.activeLoanCounts().get(member.id) ?? 0),
      String(member.borrowingLimit),
      member.registrationDate,
    ]);
    const csv = [columns, ...rows]
      .map((row) => row.map((value) => this.csvCell(value)).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'library-members.csv';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private csvCell(value: string): string {
    const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safeValue.replaceAll('"', '""')}"`;
  }

  // Method to create a new member and add it to the members list
protected saveMember(): void {
  const name = this.newName().trim();
  const icNo = this.newIcNo().trim();
  const email = this.newEmail().trim();
  const phone = this.newPhone().trim();
  const selectedId = this.selectedMemberId();

  if (!name || !icNo || !email || !phone) return;
  
  this.members.update((members) => {
    if (selectedId) {
      return members.map((member) =>
        member.id === selectedId
          ? {
              ...member,
              name,
              icNo,
              email,
              phone,
              status: this.newStatus(),
              borrowingLimit: this.newBorrowingLimit(),
            }
          : member,
      );
    }

    const nextNumber =
      members.reduce((largest, member) => {
        const match = /^MB-(\d+)$/.exec(member.id);
        return match ? Math.max(largest, Number(match[1])) : largest;
      }, 0) + 1;

    const today = new Date();
    const registrationDate =
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return [
      ...members,
      {
        id: `MB-${String(nextNumber).padStart(3, '0')}`,
        icNo,
        name,
        email,
        phone,
        registrationDate,
        status: 'active',
        borrowingLimit: 5,
      },
    ];
  });

  this.closeMemberForm();
  } 

// Method to edit an existing member's details
  protected readonly selectedMemberId = signal<string | null>(null);
  protected readonly newStatus = signal<Member['status']>('active');

  protected editMember(member: Member): void {
    this.selectedMemberId.set(member.id);
    this.newName.set(member.name);
    this.newIcNo.set(member.icNo);
    this.newEmail.set(member.email);
    this.newPhone.set(member.phone);
    this.newBorrowingLimit.set(member.borrowingLimit);
    this.newStatus.set(member.status);
    this.showMemberForm.set(true);
  }

  // Method to delete a member from the list
  protected deleteMember(member: Member): void {
   const hasLoanHistory = this.borrowingService
    .borrowings()
    .some((loan) => loan.memberId === member.id);

    if (hasLoanHistory) {
      window.alert(
        `${member.name} has loan records. Keep the member record and suspend the account instead.`,
      );
      return;
    }

    const confirmed = window.confirm(
      `Remove ${member.name} from the member list?`,
    );
    
    if (!confirmed) return;

    this.members.update((members) =>
      members.filter((item) => item.id !== member.id),
    );

    if (this.selectedMemberId() === member.id) {
      this.selectedMemberId.set(null);
      this.showMemberForm.set(false);
    }
  }

// Inject the BorrowingService to access borrowing data
 private readonly borrowingService = inject(BorrowingService);
// Computed property to get the count of active loans for each member
  protected readonly activeLoanCounts = computed(() => {
    const counts = new Map<string, number>();

    for (const loan of this.borrowingService.borrowings()) {
      if (this.borrowingService.isActiveLoan(loan)) {
        counts.set(loan.memberId, (counts.get(loan.memberId) ?? 0) + 1);
      }
    }

    return counts;
  });
}
