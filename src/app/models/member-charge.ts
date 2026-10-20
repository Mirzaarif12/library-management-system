import type { DamageSeverity } from './borrowing';

export interface MemberCharge {
  id: string;
  memberId: string;
  borrowingId: string;
  bookId: string;
  reason: 'borrower-lost-book' | 'borrower-damaged-book' | 'late-return';
  amount: number;
  damageSeverity?: DamageSeverity;
  bookPriceAtIssue?: number;
  issuedAt: string;
  paymentDueAt: string;
  status: 'unpaid' | 'paid' | 'waived';
  paidAt: string | null;
  waivedAt?: string | null;
  waiverReason?: string | null;
}