import {
  provideHttpClient,
  withInterceptors,
  HttpClient,
  HttpXsrfTokenExtractor,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authApi } from './auth-api';
import { authInterceptor, safeReturnUrl } from './auth.interceptor';
import { AuthStore } from './auth.store';

describe('authInterceptor', () => {
  const authStore = { clearSession: vi.fn() };
  const router = {
    url: '/personas',
    navigate: vi.fn().mockResolvedValue(true),
  };
  const tokenExtractor = { getToken: vi.fn(() => 'signed-xsrf-token') };
  let http: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    authStore.clearSession.mockClear();
    router.navigate.mockClear();
    tokenExtractor.getToken.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: authStore },
        { provide: Router, useValue: router },
        { provide: HttpXsrfTokenExtractor, useValue: tokenExtractor },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('sends API cookies and the XSRF token on unsafe requests', () => {
    http.post<void>(authApi.logout, null).subscribe();
    const request = httpTesting.expectOne(authApi.logout);

    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('X-XSRF-TOKEN')).toBe('signed-xsrf-token');
    request.flush(null);
  });

  it('sends API cookies without an XSRF header on safe requests', () => {
    http.get(authApi.me).subscribe();
    const request = httpTesting.expectOne(authApi.me);

    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    request.flush({ user: null });
  });

  it('does not alter requests outside the application API', () => {
    http.get('https://example.com/resource').subscribe();
    const request = httpTesting.expectOne('https://example.com/resource');

    expect(request.request.withCredentials).toBe(false);
    expect(request.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    request.flush({});
  });

  it('clears the session and redirects when a protected request expires', () => {
    http.get(`${authApi.me}/protected-resource`).subscribe({ error: () => undefined });
    httpTesting
      .expectOne(`${authApi.me}/protected-resource`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authStore.clearSession).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/personas' },
    });
  });
});

describe('safeReturnUrl', () => {
  it('only accepts internal application routes', () => {
    expect(safeReturnUrl('/personas?status=ACTIVE')).toBe('/personas?status=ACTIVE');
    expect(safeReturnUrl('https://attacker.example')).toBeNull();
    expect(safeReturnUrl('//attacker.example')).toBeNull();
    expect(safeReturnUrl('/login')).toBeNull();
    expect(safeReturnUrl('/login?returnUrl=/personas')).toBeNull();
  });
});
