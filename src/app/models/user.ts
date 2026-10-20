export type UserRole = 'admin' | 'staff' | 'member';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  memberId?: string;
}