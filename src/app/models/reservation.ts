export type ReservationStatus =
  | 'waiting'
  | 'ready'
  | 'collected'
  | 'cancelled'
  | 'expired';

export interface Reservation {
  id: string;
  memberId: string;
  bookId: string;
  requestedAt: string;
  status: ReservationStatus;
  readyAt: string | null;
  pickupDeadline: string | null;
  collectedAt: string | null;
}