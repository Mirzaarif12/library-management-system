import { Service, afterNextRender, effect, signal } from '@angular/core';
import type { Member } from '../../models/member';

@Service()
export class MemberService {
// Signal to indicate whether the local storage is ready
    private readonly storageReady = signal(false);

// Signal to hold the list of members    
    constructor() {
    afterNextRender(() => {
        try {
        const saved = localStorage.getItem('library-members');

        if (saved) {
            const parsed: unknown = JSON.parse(saved);

            if (Array.isArray(parsed)) {
            this.members.set(parsed as Member[]);
            }
        }
        } catch {
        // Keep the sample members if saved data cannot be read.
        } finally {
        this.storageReady.set(true);
        }
    });
// Effect to save members to local storage whenever the members signal changes
    effect(() => {
        if (!this.storageReady()) return;

        try {
        localStorage.setItem('library-members', JSON.stringify(this.members()));
        } catch {
        // The browser may prevent local storage from being used.
        }
    });
    }

    readonly members = signal<Member[]>([
    {
        id: 'MB-001',
        icNo: 'SAMPLE-IC-001',
        name: 'Sara Lee',
        email: 'sara@example.com',
        phone: '012-3456789',
        registrationDate: '2026-09-29',
        status: 'active',
        borrowingLimit: 5,
    },
    {
        id: 'MB-002',
        icNo: 'SAMPLE-IC-002',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '012-3456789',
        registrationDate: '2026-09-29',
        status: 'active',
        borrowingLimit: 5,
    },
    {
        id: 'MB-003',
        icNo: 'SAMPLE-IC-003',
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '012-3456789',
        registrationDate: '2026-09-29',
        status: 'suspended',
        borrowingLimit: 5,
    },
]);

    registerMember(details: Pick<Member, 'name' | 'icNo' | 'email' | 'phone'>): Member | null {
    const email = details.email.trim();
    const icNo = details.icNo.trim();

    const alreadyExists = this.members().some(
        (member) =>
        member.email.toLowerCase() === email.toLowerCase() ||
        member.icNo.toLowerCase() === icNo.toLowerCase(),
    );

    if (alreadyExists) return null;

    const highestId = this.members().reduce((highest, member) => {
        const match = /^MB-(\d+)$/.exec(member.id);
        return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);

    const today = new Date();
    const registrationDate = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
    ].join('-');

    const newMember: Member = {
        id: `MB-${String(highestId + 1).padStart(3, '0')}`,
        name: details.name.trim(),
        icNo,
        email,
        phone: details.phone.trim(),
        registrationDate,
        status: 'active',
        borrowingLimit: 5,
    };

    this.members.update((members) => [...members, newMember]);
    return newMember;
    }
}

