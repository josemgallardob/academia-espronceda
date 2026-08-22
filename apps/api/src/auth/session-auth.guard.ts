import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_CONFIGURATION, IS_PUBLIC_KEY } from './auth.constants';
import type { AuthConfiguration } from './auth.configuration';
import { AuthService, authenticationRequired } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    @Inject(AUTH_CONFIGURATION)
    private readonly configuration: AuthConfiguration,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[this.configuration.authCookieName];
    if (!token) {
      throw authenticationRequired();
    }

    request.authenticatedUser = await this.authService.validateSession(token);
    request.sessionToken = token;
    return true;
  }
}
