import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { ProblemDetailsFilter } from '../http/problem-details.filter';
import { hashPassword } from '../security/password-hasher';
import { AUTH_CONFIGURATION, DUMMY_PASSWORD_HASH } from './auth.constants';
import {
  loadAuthConfiguration,
  type AuthConfiguration,
} from './auth.configuration';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OriginGuard } from './origin.guard';
import { SessionAuthGuard } from './session-auth.guard';
import { XsrfGuard } from './xsrf.guard';
import { XsrfService } from './xsrf.service';

@Module({
  imports: [
    JwtModule.register({}),
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const configuration = loadAuthConfiguration();
        const ttl = configuration.loginRateWindowSeconds * 1_000;
        return [
          {
            name: 'loginIp',
            ttl,
            limit: configuration.loginRateIpLimit,
            getTracker: (request: Record<string, unknown>) =>
              requestIp(request),
          },
          {
            name: 'loginIdentifier',
            ttl,
            limit: configuration.loginRateIdentifierLimit,
            getTracker: (request: Record<string, unknown>) =>
              requestIdentifier(request),
          },
        ];
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_CONFIGURATION,
      useFactory: (): AuthConfiguration => loadAuthConfiguration(),
    },
    {
      provide: DUMMY_PASSWORD_HASH,
      useFactory: async (): Promise<string> =>
        hashPassword('dummy password that is never a real credential'),
    },
    AuthService,
    XsrfService,
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: OriginGuard,
    },
    {
      provide: APP_GUARD,
      useClass: XsrfGuard,
    },
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
  ],
})
export class AuthModule {}

function requestIp(request: Record<string, unknown>): string {
  if (typeof request.ip === 'string' && request.ip.length > 0) {
    return request.ip;
  }
  const socket = request.socket;
  if (
    typeof socket === 'object' &&
    socket !== null &&
    'remoteAddress' in socket &&
    typeof socket.remoteAddress === 'string'
  ) {
    return socket.remoteAddress;
  }
  return 'unknown-ip';
}

function requestIdentifier(request: Record<string, unknown>): string {
  const body = request.body;
  if (
    typeof body === 'object' &&
    body !== null &&
    'identifier' in body &&
    typeof body.identifier === 'string'
  ) {
    return body.identifier.trim().toLowerCase() || 'invalid-identifier';
  }
  return 'invalid-identifier';
}
