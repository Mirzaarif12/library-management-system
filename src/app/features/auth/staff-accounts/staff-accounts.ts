import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService, type StaffAccount } from '../authservice';

@Component({
  selector: 'app-staff-accounts',
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './staff-accounts.html',
  styleUrl: './staff-accounts.css',
})
export class StaffAccounts {
  private readonly authService = inject(AuthService);
  protected readonly staffAccounts = this.authService.staffAccounts;
  protected readonly isAdmin = computed(() => this.authService.currentUser()?.role === 'admin');
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly resetForId = signal<string | null>(null);
  protected readonly editForId = signal<string | null>(null);
  protected readonly showInitialPassword = signal(false);
  protected readonly staffSearch = signal('');
  protected readonly statusFilter = signal<'all' | StaffAccount['status']>('all');
  protected readonly staffPage = signal(1);
  protected readonly staffPageSize = 6;

  protected readonly totalStaff = computed(() => this.staffAccounts().length);
  protected readonly activeStaff = computed(() =>
    this.staffAccounts().filter((account) => account.status === 'active').length,
  );
  protected readonly disabledStaff = computed(() =>
    this.staffAccounts().filter((account) => account.status === 'disabled').length,
  );
  protected readonly filteredStaff = computed(() => {
    const query = this.staffSearch().trim().toLowerCase();
    const status = this.statusFilter();
    return this.staffAccounts().filter((account) =>
      (status === 'all' || account.status === status) &&
      (!query || `${account.name} ${account.email} ${account.id}`.toLowerCase().includes(query)),
    );
  });
  protected readonly staffPageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredStaff().length / this.staffPageSize)),
  );
  protected readonly currentStaffPage = computed(() =>
    Math.min(this.staffPage(), this.staffPageCount()),
  );
  protected readonly staffPageNumbers = computed(() => {
    const count = this.staffPageCount();
    const start = Math.max(1, Math.min(this.currentStaffPage() - 2, count - 4));
    return Array.from({ length: Math.min(5, count - start + 1) }, (_, index) => start + index);
  });
  protected readonly visibleStaff = computed(() => {
    const start = (this.currentStaffPage() - 1) * this.staffPageSize;
    return this.filteredStaff().slice(start, start + this.staffPageSize);
  });
  protected readonly staffRangeStart = computed(() =>
    this.filteredStaff().length === 0 ? 0 : (this.currentStaffPage() - 1) * this.staffPageSize + 1,
  );
  protected readonly staffRangeEnd = computed(() =>
    Math.min(this.currentStaffPage() * this.staffPageSize, this.filteredStaff().length),
  );

  protected readonly createForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
  });

  protected readonly resetForm = new FormGroup({
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
  });

  protected readonly editForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
  });

  protected setStaffSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.staffSearch.set(target.value);
    this.staffPage.set(1);
  }

  protected setStatusFilter(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    this.statusFilter.set(
      target.value === 'active' || target.value === 'disabled' ? target.value : 'all',
    );
    this.staffPage.set(1);
  }

  protected changeStaffPage(delta: number): void {
    this.staffPage.set(
      Math.min(this.staffPageCount(), Math.max(1, this.currentStaffPage() + delta)),
    );
  }

  protected goToStaffPage(page: number): void {
    this.staffPage.set(Math.min(this.staffPageCount(), Math.max(1, page)));
  }

  protected staffInitial(account: StaffAccount): string {
    return account.name.trim().charAt(0).toUpperCase() || '?';
  }

  protected startEdit(account: StaffAccount): void {
    this.cancelReset();
    this.editForId.set(account.id);
    this.editForm.setValue({ name: account.name, email: account.email });
    this.error.set('');
    this.message.set('');
  }

  protected cancelEdit(): void {
    this.editForId.set(null);
    this.editForm.reset();
  }

  protected saveEdit(): void {
    this.error.set('');
    this.message.set('');
    this.editForm.markAllAsTouched();
    if (this.editForm.invalid) return;
    const id = this.editForId();
    if (!id) return;
    const { name, email } = this.editForm.getRawValue();
    const error = this.authService.updateStaffAccount(id, name, email);
    if (error) {
      this.error.set(error);
      return;
    }
    this.cancelEdit();
    this.message.set('Staff account updated.');
  }

  protected exportStaff(): void {
    const columns = ['Name', 'Email', 'Role', 'Status', 'Last login', 'Created on'];
    const rows = this.filteredStaff().map((account) => [
      account.name, account.email, 'Staff', account.status,
      account.lastLoginAt ?? '', account.createdAt ?? '',
    ]);
    const csv = [columns, ...rows]
      .map((row) => row.map((value) => this.csvCell(value)).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'staff-accounts.csv';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private csvCell(value: string): string {
    const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safeValue.replaceAll('"', '""')}"`;
  }

  protected createStaff(): void {
    this.error.set('');
    this.message.set('');
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    const { name, email, password } = this.createForm.getRawValue();
    const error = this.authService.createStaffAccount(name, email, password);
    if (error) {
      this.error.set(error);
      return;
    }
    this.createForm.reset();
    this.message.set('Staff account created. They can now sign in with the email and password you entered.');
  }

  protected toggleStatus(account: StaffAccount): void {
    this.error.set('');
    this.message.set('');
    const active = account.status === 'disabled';
    if (!active && !window.confirm(`Disable ${account.name}'s sign-in?`)) return;

    const error = this.authService.setStaffActive(account.id, active);
    if (error) this.error.set(error);
    else this.message.set(`${account.name}'s account is now ${active ? 'active' : 'disabled'}.`);
  }

  protected startReset(id: string): void {
    this.cancelEdit();
    this.resetForId.set(id);
    this.resetForm.reset();
    this.error.set('');
    this.message.set('');
  }

  protected cancelReset(): void {
    this.resetForId.set(null);
    this.resetForm.reset();
  }

  protected savePassword(): void {
    this.error.set('');
    this.message.set('');
    this.resetForm.markAllAsTouched();
    if (this.resetForm.invalid) return;
    const id = this.resetForId();
    if (!id) return;
    const error = this.authService.resetStaffPassword(id, this.resetForm.controls.password.value);
    if (error) {
      this.error.set(error);
      return;
    }
    this.cancelReset();
    this.message.set('Staff password updated.');
  }
}
