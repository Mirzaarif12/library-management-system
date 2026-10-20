import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators, } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../authservice';
import { MemberService } from '../../members/memberservice';

const passwordsMatch: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const password = control.get('password')?.value as string | undefined;
  const confirmation = control.get('confirmPassword')?.value as string | undefined;

  if (!password || !confirmation) return null;

  return password === confirmation ? null : { passwordsMismatch: true };
};

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-signup',
  styleUrl: './signup.css',
  templateUrl: './signup.html',
})

export class Signup {
  protected readonly signupForm = new FormGroup({
      name: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      icNo: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      email: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.email],
      }),
      phone: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8)],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),

    }, { validators: passwordsMatch });


  private readonly authService = inject(AuthService);
  private readonly memberService = inject(MemberService);
  private readonly router = inject(Router);

  protected readonly errorMessage = signal('');

    protected submit(): void {
      this.errorMessage.set('');
      this.signupForm.markAllAsTouched();

      if (this.signupForm.invalid) return;

      const { name, icNo, email, phone, password } =
        this.signupForm.getRawValue();

      if (this.authService.emailIsRegistered(email)) {
        this.errorMessage.set('That email is already registered.');
        return;
      }

      const member = this.memberService.registerMember({
        name,
        icNo,
        email,
        phone,
      });

      if (!member) {
        this.errorMessage.set('That email or IC number is already registered.');
        return;
      }

      const accountCreated = this.authService.registerMemberAccount(
        email,
        password,
        member.id,
      );

      if (!accountCreated) {
        this.errorMessage.set('Could not create the account. Please try again.');
        return;
      }

      void this.router.navigateByUrl('/dashboard');
    }


}