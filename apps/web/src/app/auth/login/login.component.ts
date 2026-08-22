import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { safeReturnUrl } from '../auth.interceptor';
import type { ProblemDetails } from '../auth.models';
import { AuthStore } from '../auth.store';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly form = new FormGroup({
    identifier: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.authStore
      .login(this.form.getRawValue())
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          const returnUrl = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
          void this.router.navigateByUrl(returnUrl ?? '/', { replaceUrl: true });
        },
        error: (error: unknown) => this.showLoginError(error),
      });
  }

  private showLoginError(error: unknown): void {
    if (
      error instanceof HttpErrorResponse &&
      error.status === 401 &&
      (error.error as Partial<ProblemDetails> | null)?.code === 'INVALID_CREDENTIALS'
    ) {
      this.errorMessage.set('El usuario/email o la contraseña no son correctos.');
      return;
    }
    this.errorMessage.set('No se ha podido iniciar sesión. Inténtalo de nuevo en unos instantes.');
  }
}
