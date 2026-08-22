import {
  HttpErrorResponse,
  type HttpInterceptorFn,
  HttpXsrfTokenExtractor,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { authApi, isApplicationApiUrl } from './auth-api';
import { AuthStore } from './auth.store';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isApplicationApiUrl(request.url)) {
    return next(request);
  }

  const xsrfTokenExtractor = inject(HttpXsrfTokenExtractor);
  const authStore = inject(AuthStore);
  const router = inject(Router);
  const token = xsrfTokenExtractor.getToken();
  const requiresXsrf = !SAFE_METHODS.has(request.method.toUpperCase());
  const headers =
    requiresXsrf && token && !request.headers.has('X-XSRF-TOKEN')
      ? request.headers.set('X-XSRF-TOKEN', token)
      : request.headers;
  const securedRequest = request.clone({ headers, withCredentials: true });

  return next(securedRequest).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        authStore.clearSession();
        if (request.url !== authApi.login && request.url !== authApi.me) {
          const returnUrl = safeReturnUrl(router.url);
          void router.navigate(['/login'], {
            queryParams: returnUrl ? { returnUrl } : undefined,
          });
        }
      }
      return throwError(() => error);
    }),
  );
};

export function safeReturnUrl(url: string | null): string | null {
  const path = url?.split(/[?#]/u, 1)[0];
  if (!url || !url.startsWith('/') || url.startsWith('//') || path === '/login') {
    return null;
  }
  return url;
}
