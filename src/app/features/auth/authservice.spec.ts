import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './authservice';

@Component({ template: '' })
class RenderHost {}

function serviceWithBrowserStorage(): AuthService {
  TestBed.configureTestingModule({ imports: [RenderHost] });
  const service = TestBed.inject(AuthService);
  const host = TestBed.createComponent(RenderHost);
  host.detectChanges();
  TestBed.tick();
  return service;
}

describe('staff account permissions and persistence', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('lets active staff create staff, but only admins manage their access', () => {
    const auth = serviceWithBrowserStorage();
    expect(auth.signIn('staff@library.test', 'Staff123!')).toBe(true);

    expect(auth.createStaffAccount('Alex', 'alex@library.test', 'Password123!')).toBeNull();
    const account = auth.staffAccounts().find((item) => item.email === 'alex@library.test');
    expect(account?.status).toBe('active');
    expect(auth.setStaffActive(account!.id, false)).toMatch(/Only an admin/);
    expect(auth.resetStaffPassword(account!.id, 'Changed123!')).toMatch(/Only an admin/);
    expect(auth.createStaffAccount('Duplicate', 'ALEX@library.test', 'Password123!')).toMatch(/already registered/);

    auth.signOut();
    expect(auth.signIn('admin@library.test', 'Admin123!')).toBe(true);
    expect(auth.setStaffActive(account!.id, false)).toBeNull();
    auth.signOut();
    expect(auth.signIn('alex@library.test', 'Password123!')).toBe(false);
    expect(auth.createStaffAccount('No', 'no@library.test', 'Password123!')).toMatch(/Only an active/);

    auth.signIn('admin@library.test', 'Admin123!');
    expect(auth.setStaffActive(account!.id, true)).toBeNull();
    expect(auth.resetStaffPassword(account!.id, 'Changed123!')).toBeNull();
    auth.signOut();
    expect(auth.signIn('alex@library.test', 'Password123!')).toBe(false);
    expect(auth.signIn('alex@library.test', 'Changed123!')).toBe(true);
  });

  it('restores staff status after a reload and rejects a stored disabled session', () => {
    const auth = serviceWithBrowserStorage();
    auth.signIn('admin@library.test', 'Admin123!');
    expect(auth.createStaffAccount('Taylor', 'taylor@library.test', 'Password123!')).toBeNull();
    const id = auth.staffAccounts().find((item) => item.email === 'taylor@library.test')!.id;
    expect(auth.setStaffActive(id, false)).toBeNull();
    TestBed.tick();

    localStorage.setItem('library-current-user', JSON.stringify({ id, email: 'taylor@library.test', role: 'staff' }));
    TestBed.resetTestingModule();
    const restored = serviceWithBrowserStorage();
    expect(restored.currentUser()).toBeNull();
    expect(restored.staffAccounts().find((item) => item.id === id)?.status).toBe('disabled');
    expect(restored.signIn('taylor@library.test', 'Password123!')).toBe(false);
  });
});
