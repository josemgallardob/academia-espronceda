import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { UsersRepository } from '../database/repositories/users.repository';
import { ProblemDetailsException } from '../http/problem-details.exception';
import { recordLoginAttempt } from '../observability/operational-metrics';
import { writeStructuredLog } from '../observability/structured-log';
import { verifyPassword } from '../security/password-hasher';
import { AUTH_CONFIGURATION, DUMMY_PASSWORD_HASH } from './auth.constants';
import type { AuthConfiguration } from './auth.configuration';
import type {
  AuthenticatedUser,
  SessionClaims,
  SessionResponse,
} from './auth.types';

export interface LoginResult extends SessionResponse {
  token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    @Inject(AUTH_CONFIGURATION)
    private readonly configuration: AuthConfiguration,
    @Inject(DUMMY_PASSWORD_HASH)
    private readonly dummyPasswordHash: string,
  ) {}

  async login(identifier: string, password: string): Promise<LoginResult> {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const user =
      await this.usersRepository.findByIdentity(normalizedIdentifier);
    const passwordMatches = await this.passwordMatches(
      user?.passwordHash ?? this.dummyPasswordHash,
      password,
    );

    if (!user || !user.isActive || !passwordMatches) {
      recordLoginAttempt('INVALID_CREDENTIALS');
      writeStructuredLog({
        level: 'warn',
        event: 'auth.login',
        outcome: 'INVALID_CREDENTIALS',
        identityFingerprint: fingerprint(normalizedIdentifier),
      });
      throw invalidCredentials();
    }

    const authenticatedUser = toAuthenticatedUser(user);
    const token = await this.jwtService.signAsync(
      {
        username: user.username,
        tokenVersion: user.tokenVersion,
      },
      {
        algorithm: 'HS256',
        secret: this.configuration.jwtSecret,
        issuer: this.configuration.jwtIssuer,
        audience: this.configuration.jwtAudience,
        subject: user.id,
        expiresIn: this.configuration.jwtExpiresInSeconds,
      },
    );

    await this.usersRepository.recordLogin(user.id, new Date().toISOString());
    recordLoginAttempt('AUTHENTICATED');
    writeStructuredLog({
      level: 'info',
      event: 'auth.login',
      outcome: 'AUTHENTICATED',
      userId: user.id,
    });

    return { token, user: authenticatedUser };
  }

  async validateSession(token: string): Promise<AuthenticatedUser> {
    let claims: SessionClaims;
    try {
      claims = await this.jwtService.verifyAsync<SessionClaims>(token, {
        algorithms: ['HS256'],
        secret: this.configuration.jwtSecret,
        issuer: this.configuration.jwtIssuer,
        audience: this.configuration.jwtAudience,
      });
    } catch {
      throw authenticationRequired();
    }

    if (!validClaims(claims)) {
      throw authenticationRequired();
    }

    const user = await this.usersRepository.findById(claims.sub);
    if (
      !user ||
      !user.isActive ||
      user.tokenVersion !== claims.tokenVersion ||
      user.username !== claims.username
    ) {
      throw authenticationRequired();
    }

    return toAuthenticatedUser(user);
  }

  private async passwordMatches(
    passwordHash: string,
    password: string,
  ): Promise<boolean> {
    try {
      return await verifyPassword(passwordHash, password);
    } catch {
      return false;
    }
  }
}

function validClaims(claims: SessionClaims): boolean {
  return (
    typeof claims.sub === 'string' &&
    claims.sub.length > 0 &&
    typeof claims.username === 'string' &&
    claims.username.length > 0 &&
    Number.isSafeInteger(claims.tokenVersion) &&
    claims.tokenVersion >= 0
  );
}

function toAuthenticatedUser(user: {
  id: string;
  username: string;
  email: string;
}): AuthenticatedUser {
  return { id: user.id, username: user.username, email: user.email };
}

function fingerprint(identity: string): string {
  return createHash('sha256').update(identity).digest('hex').slice(0, 12);
}

export function invalidCredentials(): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 401,
    code: 'INVALID_CREDENTIALS',
    title: 'Credenciales no válidas',
  });
}

export function authenticationRequired(): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 401,
    code: 'AUTHENTICATION_REQUIRED',
    title: 'Autenticación requerida',
  });
}
