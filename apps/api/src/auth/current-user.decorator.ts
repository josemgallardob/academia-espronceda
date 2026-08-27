import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { authenticationRequired } from './auth.service';
import type { AuthenticatedRequest, AuthenticatedUser } from './auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.authenticatedUser) {
      throw authenticationRequired();
    }
    return request.authenticatedUser;
  },
);
