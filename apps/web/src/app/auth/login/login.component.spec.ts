import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import type { SessionResponse } from '../auth.models';
import { AuthStore } from '../auth.store';
import { LoginComponent } from './login.component';

const session: SessionResponse = {
  user: {
    id: '1d2ad77e-df31-48b9-b9dc-a8dcfd6eb332',
    username: 'admin',
    email: 'admin@example.com',
  },
};

describe('LoginComponent', () => {
  const authStore = { login: vi.fn() };
  let router: Router;

  beforeEach(async () => {
    authStore.login.mockReset();
    await TestBed.configureTestingModule({
      imports: [LoginComponent, ReactiveFormsModule],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: authStore },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({ returnUrl: '/personas' }),
            },
          },
        },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  it('renders the credential form with appropriate autocomplete fields', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h2')?.textContent).toContain('Iniciar sesión');
    expect(element.querySelector<HTMLInputElement>('#identifier')?.autocomplete).toBe('username');
    expect(element.querySelector<HTMLInputElement>('#password')?.autocomplete).toBe(
      'current-password',
    );
  });

  it('does not submit empty credentials and exposes validation feedback', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLFormElement>('form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(authStore.login).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Introduce tu usuario o email.');
  });

  it('submits once, disables the action and returns to the intended route', () => {
    const pending = new Subject<SessionResponse>();
    authStore.login.mockReturnValue(pending);
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    component.form.setValue({ identifier: 'admin', password: 'secret' });

    component.submit();
    expect(component.submitting()).toBe(true);
    expect(authStore.login).toHaveBeenCalledWith({
      identifier: 'admin',
      password: 'secret',
    });

    pending.next(session);
    pending.complete();
    expect(component.submitting()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/personas', {
      replaceUrl: true,
    });
  });

  it('shows the generic credentials message returned by the API', () => {
    authStore.login.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            error: { code: 'INVALID_CREDENTIALS' },
          }),
      ),
    );
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.componentInstance.form.setValue({
      identifier: 'admin',
      password: 'wrong',
    });

    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'El usuario/email o la contraseña no son correctos.',
    );
  });

  it('handles a successful immediate response', () => {
    authStore.login.mockReturnValue(of(session));
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.componentInstance.form.setValue({
      identifier: 'admin',
      password: 'secret',
    });
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.submitting()).toBe(false);
  });

  it('exposes the local demo account and opens Horario after a demo login', () => {
    authStore.login.mockReturnValue(of(session));
    const fixture = TestBed.createComponent(LoginComponent);
    const route = TestBed.inject(ActivatedRoute);
    Object.assign(route.snapshot, { queryParamMap: convertToParamMap({}) });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('profesor1');
    expect(element.textContent).toContain('local-only-admin-password-1');

    element.querySelector<HTMLButtonElement>('.demo-action')?.click();
    fixture.detectChanges();

    expect(authStore.login).toHaveBeenCalledWith({
      identifier: 'profesor1',
      password: 'local-only-admin-password-1',
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/horario', {
      replaceUrl: true,
    });
  });
});
