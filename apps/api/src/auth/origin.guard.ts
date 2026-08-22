import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ProblemDetailsException } from '../http/problem-details.exception';
import { AUTH_CONFIGURATION } from './auth.constants';
import type { AuthConfiguration } from './auth.configuration';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    @Inject(AUTH_CONFIGURATION)
    private readonly configuration: AuthConfiguration,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const origin = request.get('origin');
    if (!origin || !this.configuration.corsOrigins.includes(origin)) {
      throw new ProblemDetailsException({
        status: 403,
        code: 'ORIGIN_FORBIDDEN',
        title: 'Origen de petición no permitido',
      });
    }

    return true;
  }
}
