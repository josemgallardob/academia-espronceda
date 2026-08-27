import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../auth/auth.store';

@Component({
  selector: 'app-authenticated-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './authenticated-layout.component.html',
  styleUrl: './authenticated-layout.component.scss',
})
export class AuthenticatedLayoutComponent {
  private readonly router = inject(Router);
  readonly authStore = inject(AuthStore);
  readonly signingOut = signal(false);

  logout(): void {
    if (this.signingOut()) {
      return;
    }
    this.signingOut.set(true);
    this.authStore.logout().subscribe({
      next: () => this.goToLogin(),
      error: () => this.goToLogin(),
    });
  }

  private goToLogin(): void {
    this.signingOut.set(false);
    void this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
