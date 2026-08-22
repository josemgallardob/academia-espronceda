import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { loadApiEnvironment } from '../src/config/environment';
import { configureApiApplication } from '../src/configure-api-application';
import { DatabaseConnection } from '../src/database/database.connection';
import { UsersRepository } from '../src/database/repositories/users.repository';
import { hashPassword } from '../src/security/password-hasher';

const FRONTEND_ORIGIN = 'http://frontend.test';
const AUTH_COOKIE = 'academia_session';
const XSRF_COOKIE = 'XSRF-TOKEN';
const JWT_SECRET = 'integration-test-jwt-secret-never-used-in-production';
const JWT_ISSUER = 'academia-espronceda-api';
const JWT_AUDIENCE = 'academia-espronceda-web';

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let connection: DatabaseConnection;
  let usersRepository: UsersRepository;
  let jwtService: JwtService;
  let temporaryDirectory: string;
  let originalEnvironment: NodeJS.ProcessEnv;
  let mainUserId: string;
  let revokedUserId: string;
  let inactiveUserId: string;

  beforeAll(async () => {
    originalEnvironment = { ...process.env };
    temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'academia-auth-'));
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = `file:${resolve(temporaryDirectory, 'auth.db')}`;
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.JWT_ISSUER = JWT_ISSUER;
    process.env.JWT_AUDIENCE = JWT_AUDIENCE;
    process.env.AUTH_COOKIE_NAME = AUTH_COOKIE;
    process.env.XSRF_COOKIE_NAME = XSRF_COOKIE;
    process.env.COOKIE_SECURE = 'false';
    process.env.TRUST_PROXY = 'true';
    process.env.API_CORS_ORIGINS = FRONTEND_ORIGIN;
    process.env.AUTH_LOGIN_IP_LIMIT = '20';
    process.env.AUTH_LOGIN_IDENTIFIER_LIMIT = '5';

    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApiApplication(
      app as NestExpressApplication,
      loadApiEnvironment(),
    );

    connection = moduleFixture.get(DatabaseConnection);
    usersRepository = moduleFixture.get(UsersRepository);
    jwtService = moduleFixture.get(JwtService);
    await connection.migrate(resolve(__dirname, '../drizzle'));

    const passwordHash = await hashPassword('correct horse battery staple');
    mainUserId = randomUUID();
    revokedUserId = randomUUID();
    inactiveUserId = randomUUID();
    const now = new Date().toISOString();
    await usersRepository.insert({
      id: mainUserId,
      username: 'admin',
      email: 'admin@example.com',
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    await usersRepository.insert({
      id: revokedUserId,
      username: 'revoked',
      email: 'revoked@example.com',
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    await usersRepository.insert({
      id: inactiveUserId,
      username: 'inactive',
      email: 'inactive@example.com',
      passwordHash,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnvironment;
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('keeps health public and applies security headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  it('protects the session endpoint globally', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);

    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.body).toMatchObject({
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
    });
    expect(responseBody(response).traceId).toEqual(expect.any(String));
  });

  it('logs in by case-insensitive username and sets hardened cookies', async () => {
    const response = await login('AdMiN');

    expect(response.body).toEqual({
      user: {
        id: mainUserId,
        username: 'admin',
        email: 'admin@example.com',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('password');
    const cookies = responseCookies(response);
    const sessionCookie = findCookie(cookies, AUTH_COOKIE);
    const xsrfCookie = findCookie(cookies, XSRF_COOKIE);
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Strict');
    expect(sessionCookie).toContain('Path=/');
    expect(sessionCookie).not.toContain('Secure');
    expect(xsrfCookie).not.toContain('HttpOnly');
    expect(xsrfCookie).toContain('SameSite=Strict');

    const session = extractCookieValue(cookies, AUTH_COOKIE);
    const claims = jwtService.decode<Record<string, unknown>>(session);
    expect(claims).toMatchObject({
      sub: mainUserId,
      username: 'admin',
      tokenVersion: 0,
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    });
    expect(claims.iat).toEqual(expect.any(Number));
    expect(claims.exp).toEqual(expect.any(Number));
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', `${AUTH_COOKIE}=${session}`)
      .expect(200, response.body);

    const persisted = await usersRepository.findById(mainUserId);
    expect(persisted?.lastLoginAt).not.toBeNull();
  });

  it('also logs in by case-insensitive email', async () => {
    const response = await login('ADMIN@EXAMPLE.COM');
    const user = responseBody(response).user as Record<string, unknown>;
    expect(user.id).toBe(mainUserId);
  });

  it('returns the same error for a wrong password and an unknown account', async () => {
    const existing = await login('admin', 'wrong password', 401);
    const missing = await login('nobody@example.com', 'wrong password', 401);

    expect(withoutTrace(responseBody(existing))).toEqual(
      withoutTrace(responseBody(missing)),
    );
    expect(responseBody(existing).code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects inactive accounts with the generic credentials error', async () => {
    const response = await login(
      'inactive',
      'correct horse battery staple',
      401,
    );
    expect(responseBody(response).code).toBe('INVALID_CREDENTIALS');
  });

  it('invalidates an existing session when token_version changes', async () => {
    const authenticated = await login('revoked');
    const session = extractCookieValue(
      responseCookies(authenticated),
      AUTH_COOKIE,
    );
    await usersRepository.incrementTokenVersion(
      revokedUserId,
      new Date().toISOString(),
    );

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', `${AUTH_COOKIE}=${session}`)
      .expect(401);
  });

  it('rejects expired tokens and algorithms other than HS256', async () => {
    const expired = await signSession(mainUserId, -1, 'HS256');
    const wrongAlgorithm = await signSession(mainUserId, 3_600, 'HS384');

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', `${AUTH_COOKIE}=${expired}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', `${AUTH_COOKIE}=${wrongAlgorithm}`)
      .expect(401);
  });

  it('requires an allowed origin for unsafe requests', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({
        identifier: 'admin',
        password: 'correct horse battery staple',
      })
      .expect(403);

    expect(responseBody(response).code).toBe('ORIGIN_FORBIDDEN');
  });

  it('requires a session-bound XSRF cookie and header for logout', async () => {
    const authenticated = await login('admin');
    const cookies = responseCookies(authenticated);
    const cookieHeader = requestCookieHeader(cookies);
    const xsrf = extractCookieValue(cookies, XSRF_COOKIE);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', FRONTEND_ORIGIN)
      .set('Cookie', cookieHeader)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', FRONTEND_ORIGIN)
      .set('Cookie', cookieHeader)
      .set('X-XSRF-TOKEN', `${xsrf}invalid`)
      .expect(403);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', FRONTEND_ORIGIN)
      .set('Cookie', cookieHeader)
      .set('X-XSRF-TOKEN', xsrf)
      .expect(204);
    expect(findCookie(responseCookies(response), AUTH_COOKIE)).toContain(
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    );
    expect(findCookie(responseCookies(response), XSRF_COOKIE)).toContain(
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    );
  });

  it('allows CORS only for configured origins', async () => {
    const allowed = await request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('Origin', FRONTEND_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      FRONTEND_ORIGIN,
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('Origin', 'https://attacker.example')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate-limits repeated attempts for the same identifier', async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await login(
        'rate-limited-account',
        'wrong password',
        401,
        `198.51.100.${attempt}`,
      );
    }
    const limited = await login(
      'RATE-LIMITED-ACCOUNT',
      'wrong password',
      429,
      '198.51.100.6',
    );
    expect(responseBody(limited).code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('rate-limits attempts from the same IP independently', async () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      await login(
        `unknown-account-${attempt}`,
        'wrong password',
        401,
        '203.0.113.20',
      );
    }
    const limited = await login(
      'unknown-account-21',
      'wrong password',
      429,
      '203.0.113.20',
    );
    expect(responseBody(limited).code).toBe('RATE_LIMIT_EXCEEDED');
  });

  async function login(
    identifier: string,
    password = 'correct horse battery staple',
    status = 200,
    forwardedFor?: string,
  ) {
    const testRequest = request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', FRONTEND_ORIGIN);
    if (forwardedFor) {
      testRequest.set('X-Forwarded-For', forwardedFor);
    }
    return testRequest.send({ identifier, password }).expect(status);
  }

  async function signSession(
    userId: string,
    expiresIn: number,
    algorithm: 'HS256' | 'HS384',
  ): Promise<string> {
    return jwtService.signAsync(
      { username: 'admin', tokenVersion: 0 },
      {
        algorithm,
        secret: JWT_SECRET,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        subject: userId,
        expiresIn,
      },
    );
  }
});

function responseCookies(response: request.Response): string[] {
  const cookies = response.headers['set-cookie'];
  if (Array.isArray(cookies)) {
    return cookies;
  }
  return typeof cookies === 'string' ? [cookies] : [];
}

function findCookie(cookies: string[], name: string): string {
  const cookie = cookies.find((candidate) => candidate.startsWith(`${name}=`));
  if (!cookie) {
    throw new Error(`Expected response cookie ${name}`);
  }
  return cookie;
}

function extractCookieValue(cookies: string[], name: string): string {
  const pair = findCookie(cookies, name).split(';', 1)[0];
  return decodeURIComponent(pair.slice(name.length + 1));
}

function requestCookieHeader(cookies: string[]): string {
  return cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

function withoutTrace(body: Record<string, unknown>): Record<string, unknown> {
  const comparable = { ...body };
  delete comparable.traceId;
  return comparable;
}

function responseBody(response: request.Response): Record<string, unknown> {
  return response.body as Record<string, unknown>;
}
