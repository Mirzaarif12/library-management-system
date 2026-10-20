import type { DamageSeverity } from './borrowing';

export type InventoryAdjustmentReason =
  | 'purchase'
  | 'donation'
  | 'missing'
  | 'damaged'
  | 'borrower-lost'
  | 'repair-completed';

export interface InventoryAdjustment {
  id: string;
  bookId: string;
  reason: InventoryAdjustmentReason;
  quantity: number;
  totalCopiesChange: number;
  availableCopiesChange: number;
  note: string;
  adjustedAt: string;
  adjustedBy: string;
  borrowingId?: string;
  memberId?: string;
  damageSeverity?: DamageSeverity;
  borrowerResponsible?: boolean;
}