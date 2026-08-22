import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  provideRouter,
  Router,
  type RouterStateSnapshot,
} from '@angular/router';
import { anonymousGuard, authenticatedGuard } from './auth.guards';
import { AuthStore } from './auth.store';

describe('authentication guards', () => {
  const authStore = { isAuthenticated: vi.fn() };
  let router: Router;

  beforeEach(() => {
    authStore.isAuthenticated.mockReset();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: authStore }],
    });
    router = TestBed.inject(Router);
  });

  it('allows authenticated users into private routes', () => {
    authStore.isAuthenticated.mockReturnValue(true);
    const result = runAuthenticatedGuard('/personas');
    expect(result).toBe(true);
  });

  it('redirects anonymous users to login with their intended route', () => {
    authStore.isAuthenticated.mockReturnValue(false);
    const result = runAuthenticatedGuard('/personas');
    expect(router.serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe(
      '/login?returnUrl=%2Fpersonas',
    );
  });

  it('keeps an authenticated user out of the login page', () => {
    authStore.isAuthenticated.mockReturnValue(true);
    const result = TestBed.runInInjectionContext(() =>
      anonymousGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    expect(router.serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe('/');
  });

  function runAuthenticatedGuard(url: string) {
    return TestBed.runInInjectionContext(() =>
      authenticatedGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
  }
});
