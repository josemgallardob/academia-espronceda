import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AUTH_CONFIGURATION } from './auth.constants';
import type { AuthConfiguration } from './auth.configuration';

@Injectable()
export class XsrfService {
  constructor(
    @Inject(AUTH_CONFIGURATION)
    private readonly configuration: AuthConfiguration,
  ) {}

  createToken(sessionToken: string): string {
    return createHmac('sha256', this.configuration.jwtSecret)
      .update('academia-xsrf-v1\0')
      .update(sessionToken)
      .digest('base64url');
  }

  isValid(
    sessionToken: string,
    cookieToken: string | undefined,
    headerToken: string | undefined,
  ): boolean {
    if (!cookieToken || !headerToken) {
      return false;
    }

    const expected = this.createToken(sessionToken);
    return (
      safeEqual(cookieToken, headerToken) && safeEqual(headerToken, expected)
    );
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
