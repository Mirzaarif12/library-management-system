import { Service, computed, signal, effect, afterNextRender } from '@angular/core';
import type { User } from '../../models/user';

interface DemoAccount {
  email: string;
  password: string;
  user: User;
  name?: string;
  status?: 'active' | 'disabled';
  createdAt?: string;
  createdBy?: string;
  lastLoginAt?: string;
}

export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'disabled';
  createdAt: string | null;
  createdBy: string | null;
  lastLoginAt: string | null;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: 'admin@library.test',
    password: 'Admin123!',
    user: {
      id: 'USR-001',
      email: 'admin@library.test',
      role: 'admin',
    },
  },
  {
    email: 'staff@library.test',
    password: 'Staff123!',
    user: {
      id: 'USR-002',
      email: 'staff@library.test',
      role: 'staff',
    },
  },
  {
    email: 'sara@example.com',
    password: 'Member123!',
    user: {
      id: 'USR-003',
      email: 'sara@example.com',
      role: 'member',
      memberId: 'MB-001',
    },
  },
  {
    email: 'john@example.com',
    password: 'Member123!',
    user: {
      id: 'USR-004',
      email: 'john@example.com',
      role: 'member',
      memberId: 'MB-002',
    },
  }
];

@Service()
export class AuthService {
  readonly currentUser = signal<User | null>(null);
  private readonly accounts = signal<DemoAccount[]>(DEMO_ACCOUNTS);
  readonly isSignedIn = computed(() => {
    const user = this.currentUser();
    return !!user && this.accounts().some(
      (account) => account.user.id === user.id && account.status !== 'disabled',
    );
  });
  readonly staffAccounts = computed<StaffAccount[]>(() =>
    this.accounts()
      .filter((account) => account.user.role === 'staff')
      .map((account) => ({
        id: account.user.id,
        name: account.name ?? account.email,
        email: account.email,
        status: account.status ?? 'active',
        createdAt: account.createdAt ?? null,
        createdBy: account.createdBy ?? null,
        lastLoginAt: account.lastLoginAt ?? null,
      })),
  );
  
  private resolveReady!: () => void;
  readonly ready = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });

  private readonly storageReady = signal(false);

  constructor() {
    afterNextRender(() => {
      try {
        const savedAccounts = localStorage.getItem('library-auth-accounts');

        if (savedAccounts) {
          const parsed: unknown = JSON.parse(savedAccounts);

          if (Array.isArray(parsed)) {
            this.accounts.set(parsed as DemoAccount[]);
          }
        }

        const savedUser = localStorage.getItem('library-current-user');

        if (savedUser) {
          const parsed: unknown = JSON.parse(savedUser);

          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'id' in parsed &&
            'email' in parsed &&
            'role' in parsed
          ) {
            const storedUser = parsed as User;
            const account = this.accounts().find(
              (item) => item.user.id === storedUser.id && item.status !== 'disabled',
            );
            if (account) this.currentUser.set(account.user);
          }
        }
      } catch {
        // If saved data cannot be read, keep the demo accounts.
      } finally {
        this.storageReady.set(true);
        this.resolveReady();
      }
  
    });
    

    effect(() => {
      if (!this.storageReady()) return;

      try {
        localStorage.setItem(
          'library-auth-accounts',
          JSON.stringify(this.accounts()),
        );

        const user = this.currentUser();

        if (user) {
          localStorage.setItem('library-current-user', JSON.stringify(user));
        } else {
          localStorage.removeItem('library-current-user');
        }
      } catch {
        // The browser may prevent localStorage from being used.
      }
    });
  }

  signIn(email: string, password: string): boolean {
    const account = this.accounts().find(
      (item) =>
        item.email.toLowerCase() === email.trim().toLowerCase() &&
        item.password === password &&
        item.status !== 'disabled',
    );

    if (!account) return false;

    if (account.user.role === 'staff') {
      const lastLoginAt = new Date().toISOString();
      this.accounts.update((accounts) => accounts.map((item) =>
        item.user.id === account.user.id ? { ...item, lastLoginAt } : item,
      ));
    }
    this.currentUser.set(account.user);
    return true;
  }

  emailIsRegistered(email: string): boolean {
    const normalizedEmail = email.trim().toLowerCase();

    return this.accounts().some(
      (account) => account.email.toLowerCase() === normalizedEmail,
    );
  }

  private nextUserId(): string {
    const highest = this.accounts().reduce((current, account) => {
      const match = /^USR-(\d+)$/.exec(account.user.id);
      return match ? Math.max(current, Number(match[1])) : current;
    }, 0);
    return `USR-${String(highest + 1).padStart(3, '0')}`;
  }

  private canCreateStaff(): boolean {
    const user = this.currentUser();
    return !!user && this.isSignedIn() && (user.role === 'admin' || user.role === 'staff');
  }

  createStaffAccount(name: string, email: string, password: string): string | null {
    if (!this.canCreateStaff()) return 'Only an active admin or staff account can create staff.';

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!trimmedName || !normalizedEmail || password.length < 8) {
      return 'Enter a name, email, and password of at least 8 characters.';
    }
    if (this.emailIsRegistered(normalizedEmail)) return 'That email is already registered.';

    const user: User = { id: this.nextUserId(), email: normalizedEmail, role: 'staff' };
    this.accounts.update((accounts) => [
      ...accounts,
      {
        email: normalizedEmail,
        password,
        user,
        name: trimmedName,
        status: 'active',
        createdAt: new Date().toISOString(),
        createdBy: this.currentUser()!.id,
      },
    ]);
    return null;
  }

  setStaffActive(id: string, active: boolean): string | null {
    if (this.currentUser()?.role !== 'admin' || !this.isSignedIn()) {
      return 'Only an admin can manage staff accounts.';
    }
    const account = this.accounts().find((item) => item.user.id === id && item.user.role === 'staff');
    if (!account) return 'Staff account not found.';
    this.accounts.update((accounts) => accounts.map((item) =>
      item.user.id === id ? { ...item, status: active ? 'active' : 'disabled' } : item,
    ));
    return null;
  }

  updateStaffAccount(id: string, name: string, email: string): string | null {
    if (this.currentUser()?.role !== 'admin' || !this.isSignedIn()) {
      return 'Only an admin can manage staff accounts.';
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!trimmedName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return 'Enter a name and valid email address.';
    }
    if (this.accounts().some((item) =>
      item.user.id !== id && item.email.toLowerCase() === normalizedEmail,
    )) {
      return 'That email is already registered.';
    }
    if (!this.accounts().some((item) => item.user.id === id && item.user.role === 'staff')) {
      return 'Staff account not found.';
    }

    this.accounts.update((accounts) => accounts.map((item) =>
      item.user.id === id
        ? { ...item, name: trimmedName, email: normalizedEmail, user: { ...item.user, email: normalizedEmail } }
        : item,
    ));
    return null;
  }

  resetStaffPassword(id: string, password: string): string | null {
    if (this.currentUser()?.role !== 'admin' || !this.isSignedIn()) {
      return 'Only an admin can manage staff accounts.';
    }
    if (password.length < 8) return 'Password must have at least 8 characters.';
    if (!this.accounts().some((item) => item.user.id === id && item.user.role === 'staff')) {
      return 'Staff account not found.';
    }
    this.accounts.update((accounts) => accounts.map((item) =>
      item.user.id === id ? { ...item, password } : item,
    ));
    return null;
  }
// Register a new member account with the provided email, password, and member ID
  registerMemberAccount(email: string, password: string, memberId: string): boolean {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password || !memberId || this.emailIsRegistered(normalizedEmail)) {
      return false;
    }

    const user: User = {
      id: this.nextUserId(),
      email: normalizedEmail,
      role: 'member',
      memberId,
    };

    this.accounts.update((accounts) => [
      ...accounts,
      { email: normalizedEmail, password, user },
    ]);

    this.currentUser.set(user);
    return true;
  }

  signOut(): void {
    this.currentUser.set(null);
  }
}
