import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthStore } from '../auth/auth.store';
import { AuthenticatedLayoutComponent } from './authenticated-layout.component';

describe('AuthenticatedLayoutComponent', () => {
  const authStore = {
    user: signal({ username: 'admin', email: 'admin@example.com' }),
    logout: vi.fn(() => of(undefined)),
  };

  beforeEach(async () => {
    authStore.logout.mockClear();
    await TestBed.configureTestingModule({
      imports: [AuthenticatedLayoutComponent],
      providers: [provideRouter([]), { provide: AuthStore, useValue: authStore }],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  it('shows the current identity without exposing session tokens', () => {
    const fixture = TestBed.createComponent(AuthenticatedLayoutComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('admin');
    expect(text).toContain('admin@example.com');
    expect(text.toLowerCase()).not.toContain('jwt');
  });

  it('logs out from the authenticated shell', () => {
    const fixture = TestBed.createComponent(AuthenticatedLayoutComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('button')?.click();

    expect(authStore.logout).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/login', {
      replaceUrl: true,
    });
  });
});
