export type DamageSeverity = 'minor' | 'moderate' | 'severe';

export interface Borrowing {
  id: string;
  memberId: string;
  bookId: string;
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
  returnCondition?: 'good' | 'damaged';
  damageSeverity?: DamageSeverity;
  borrowerResponsible?: boolean;
  repairCompletedAt?: string | null;
  lostAt?: string | null;
}