import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './authservice';
import type { UserRole } from '../../models/user';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  // The server cannot read the browser's localStorage.
  if (!isPlatformBrowser(platformId)) return true;

  await authService.ready;

  return authService.isSignedIn()
    ? true
    : router.createUrlTree(['/login']);
};

export const roleGuard: CanActivateFn = async (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) return true;

  await authService.ready;

  const user = authService.currentUser();
  const allowedRoles = route.data['roles'] as UserRole[] | undefined;

  if (!user || !authService.isSignedIn()) {
    return router.createUrlTree(['/login']);
  }

  if (!allowedRoles?.includes(user.role)) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};
