import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../features/auth/authservice';

@Component({
  imports: [],
  selector: 'app-navbar',
  styleUrl: './navbar.css',
  templateUrl: './navbar.html',
})
export class Navbar {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected signOut(): void {
    this.authService.signOut();
    void this.router.navigateByUrl('/login');
  }
}