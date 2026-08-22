import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authApi } from './auth-api';
import type { SessionResponse } from './auth.models';
import { AuthStore } from './auth.store';

const session: SessionResponse = {
  user: {
    id: '1d2ad77e-df31-48b9-b9dc-a8dcfd6eb332',
    username: 'admin',
    email: 'admin@example.com',
  },
};

describe('AuthStore', () => {
  let store: AuthStore;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(AuthStore);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('restores an authenticated session from the backend', async () => {
    const initialization = store.initialize();
    const request = httpTesting.expectOne(authApi.me);
    expect(request.request.method).toBe('GET');
    request.flush(session);
    await initialization;

    expect(store.state()).toBe('authenticated');
    expect(store.user()).toEqual(session.user);
  });

  it('becomes anonymous when no backend session exists', async () => {
    const initialization = store.initialize();
    httpTesting
      .expectOne(authApi.me)
      .flush({ code: 'AUTHENTICATION_REQUIRED' }, { status: 401, statusText: 'Unauthorized' });
    await initialization;

    expect(store.state()).toBe('anonymous');
    expect(store.session()).toBeNull();
  });

  it('keeps the session in memory and never writes browser storage', () => {
    const localStorageWrite = vi.spyOn(localStorage, 'setItem');
    const sessionStorageWrite = vi.spyOn(sessionStorage, 'setItem');

    store.login({ identifier: 'admin', password: 'a password' }).subscribe();
    const request = httpTesting.expectOne(authApi.login);
    expect(request.request.body).toEqual({
      identifier: 'admin',
      password: 'a password',
    });
    request.flush(session);

    expect(store.user()).toEqual(session.user);
    expect(localStorageWrite).not.toHaveBeenCalled();
    expect(sessionStorageWrite).not.toHaveBeenCalled();
  });

  it('clears local session state after logout', () => {
    store.login({ identifier: 'admin', password: 'a password' }).subscribe();
    httpTesting.expectOne(authApi.login).flush(session);

    store.logout().subscribe();
    const request = httpTesting.expectOne(authApi.logout);
    expect(request.request.method).toBe('POST');
    request.flush(null);

    expect(store.state()).toBe('anonymous');
    expect(store.user()).toBeNull();
  });
});
