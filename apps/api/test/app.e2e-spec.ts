import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { loadApiEnvironment } from './../src/config/environment';
import { configureApiApplication } from './../src/configure-api-application';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let originalDatabaseUrl: string | undefined;

  beforeEach(async () => {
    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'file::memory:';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApiApplication(
      app as NestExpressApplication,
      loadApiEnvironment(),
    );
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect({
      service: 'api',
      status: 'ok',
    });
  });

  it('/ready (GET) reports database readiness independently of the solver', async () => {
    const response = await request(app.getHttpServer())
      .get('/ready')
      .expect(200);

    const body = response.body as {
      service: string;
      status: string;
      checks: { database: string; solver: string };
    };
    expect(body.service).toBe('api');
    expect(['ok', 'degraded']).toContain(body.status);
    expect(body.checks.database).toBe('ok');
    expect(['ok', 'error']).toContain(body.checks.solver);
  });

  it('/metrics (GET) exposes in-process counters without secrets', async () => {
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);
    const body = response.body as {
      httpRequestsTotal: number;
      solverRequestsTotal: number;
      loginAttemptsTotal: number;
    };

    expect(typeof body.httpRequestsTotal).toBe('number');
    expect(typeof body.solverRequestsTotal).toBe('number');
    expect(typeof body.loginAttemptsTotal).toBe('number');
    expect(JSON.stringify(response.body)).not.toMatch(/Bearer |eyJ|password/i);
  });

  it('echoes X-Request-Id on public and authenticated-failure responses', async () => {
    const health = await request(app.getHttpServer())
      .get('/health')
      .set('X-Request-Id', 'corr-health-1')
      .expect(200);
    expect(health.headers['x-request-id']).toBe('corr-health-1');

    const unauthorized = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('X-Request-Id', 'corr-auth-me')
      .expect(401);
    expect(unauthorized.headers['x-request-id']).toBe('corr-auth-me');
    const problem = unauthorized.body as { traceId: string; code: string };
    expect(problem.traceId).toBe('corr-auth-me');
    expect(problem.code).toBe('AUTHENTICATION_REQUIRED');
  });

  afterEach(async () => {
    await app.close();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });
});
