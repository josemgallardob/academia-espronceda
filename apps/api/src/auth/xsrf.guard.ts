import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemDetailsException } from '../http/problem-details.exception';
import {
  AUTH_CONFIGURATION,
  SKIP_XSRF_KEY,
  XSRF_HEADER_NAME,
} from './auth.constants';
import type { AuthConfiguration } from './auth.configuration';
import type { AuthenticatedRequest } from './auth.types';
import { XsrfService } from './xsrf.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class XsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly xsrfService: XsrfService,
    @Inject(AUTH_CONFIGURATION)
    private readonly configuration: AuthConfiguration,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const skipXsrf = this.reflector.getAllAndOverride<boolean>(SKIP_XSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (SAFE_METHODS.has(request.method.toUpperCase()) || skipXsrf) {
      return true;
    }

    const sessionToken = request.sessionToken;
    const cookieToken = request.cookies?.[this.configuration.xsrfCookieName];
    const header = request.headers[XSRF_HEADER_NAME];
    const headerToken = Array.isArray(header) ? undefined : header;
    if (
      !sessionToken ||
      !this.xsrfService.isValid(sessionToken, cookieToken, headerToken)
    ) {
      throw new ProblemDetailsException({
        status: 403,
        code: 'XSRF_TOKEN_INVALID',
        title: 'Token XSRF no válido',
      });
    }

    return true;
  }
}
