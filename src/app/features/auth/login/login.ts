import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, } from '@angular/forms';
import { AuthService } from '../authservice';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  imports: [ReactiveFormsModule, RouterLink ],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})

export class Login {

  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly errorMessage = signal('');
  
  protected readonly loginForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  protected submit(): void {
  this.errorMessage.set('');

  if (this.loginForm.invalid) {
    this.loginForm.markAllAsTouched();
    return;
  }

  const { email, password } = this.loginForm.getRawValue();

  this.authService.login(email, password).subscribe({
    next: (response) => {
      if (!response.status || !response.body) {
        this.errorMessage.set(
          response.statusMsg || 'Email or password is incorrect.',
        );
        return;
      }

    if (!this.authService.completeLogin(response.body)) {
      this.errorMessage.set('Your account is inactiveor your role is not supported.');
      return;
    }
    
    void this.router.navigateByUrl('/dashboard');

    },
    error: () => {
      this.errorMessage.set(
        'Unable to sign in. Check your details and try again.',
      );
    },
  });
 } 

  
}