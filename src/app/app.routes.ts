import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './features/auth/authguard';

export const routes: Routes = [
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard), canActivate: [authGuard] },
    { path: 'books', loadComponent: () => import('./features/books/books').then((m) => m.Books), canActivate: [authGuard] },
    { path: 'my-loans', loadComponent: () => import('./features/member-portal/my-loans/my-loans').then((m) => m.MyLoans), canActivate: [authGuard, roleGuard], data: { roles: ['member'] } },
    { path: 'my-reservations', loadComponent: () => import('./features/member-portal/my-reservations/my-reservations').then((m) => m.MyReservations), canActivate: [authGuard, roleGuard], data: { roles: ['member'] } },
    { path: 'members', loadComponent: () => import('./features/members/members').then((m) => m.Members), canActivate: [authGuard, roleGuard], data: { roles: ['admin', 'staff'] } },
    { path: 'borrowings', loadComponent: () => import('./features/borrowings/borrowings').then((m) => m.Borrowings), canActivate: [authGuard, roleGuard], data: { roles: ['admin', 'staff'] } },
    { path: 'returns', loadComponent: () => import('./features/returns/returns').then((m) => m.Returns), canActivate: [authGuard, roleGuard], data: { roles: ['admin', 'staff'] } },
    { path: 'reports', loadComponent: () => import('./features/reports/reports').then((m) => m.Reports), canActivate: [authGuard, roleGuard], data: { roles: ['admin'] } },
    { path: 'reservations', loadComponent: () => import('./features/reservations/reservation-queue/reservation-queue').then((m) => m.ReservationQueue), canActivate: [authGuard, roleGuard], data: { roles: ['admin', 'staff'] } },
    { path: 'staff-accounts', loadComponent: () => import('./features/auth/staff-accounts/staff-accounts').then((m) => m.StaffAccounts), canActivate: [authGuard, roleGuard], data: { roles: ['admin', 'staff'] } },
    { path: 'login', loadComponent: () => import('./features/auth/login/login').then((m) => m.Login) },
    { path: 'signup', loadComponent: () => import('./features/auth/signup/signup').then((m) => m.Signup),},
    //{ path: '**', redirectTo: 'dashboard'},
];
