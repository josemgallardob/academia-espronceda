import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable, tap } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { authApi } from './auth-api';
import type { AuthenticationState, LoginRequest, SessionResponse } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly sessionState = signal<SessionResponse | null>(null);
  private readonly authenticationState = signal<AuthenticationState>('checking');
  private initialization?: Promise<void>;

  readonly session = this.sessionState.asReadonly();
  readonly state = this.authenticationState.asReadonly();
  readonly user = computed(() => this.sessionState()?.user ?? null);
  readonly isAuthenticated = computed(() => this.authenticationState() === 'authenticated');

  initialize(): Promise<void> {
    this.initialization ??= firstValueFrom(this.http.get<SessionResponse>(authApi.me))
      .then((session) => this.setSession(session))
      .catch(() => this.clearSession());
    return this.initialization;
  }

  login(credentials: LoginRequest): Observable<SessionResponse> {
    return this.http
      .post<SessionResponse>(authApi.login, credentials)
      .pipe(tap((session) => this.setSession(session)));
  }

  logout(): Observable<void> {
    return this.http.post<void>(authApi.logout, null).pipe(finalize(() => this.clearSession()));
  }

  clearSession(): void {
    this.sessionState.set(null);
    this.authenticationState.set('anonymous');
  }

  private setSession(session: SessionResponse): void {
    this.sessionState.set(session);
    this.authenticationState.set('authenticated');
  }
}
