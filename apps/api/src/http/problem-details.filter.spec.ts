import { Controller, Get, INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApiApplication } from '../configure-api-application';
import { loadApiEnvironment } from '../config/environment';
import { ProblemDetailsException } from './problem-details.exception';
import { ProblemDetailsFilter } from './problem-details.filter';

@Controller()
class FailureController {
  @Get('boom')
  boom(): never {
    throw new ProblemDetailsException({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      title: 'Credenciales no válidas',
    });
  }
}

describe('ProblemDetailsFilter', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [FailureController],
      providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApiApplication(
      app as NestExpressApplication,
      loadApiEnvironment({ NODE_ENV: 'test' }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reuses the incoming request id as the problem trace id', async () => {
    const response = await request(app.getHttpServer())
      .get('/boom')
      .set('X-Request-Id', 'corr-auth-1')
      .expect(401);

    expect(response.headers['x-request-id']).toBe('corr-auth-1');
    expect(response.body).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      status: 401,
      traceId: 'corr-auth-1',
    });
    expect(JSON.stringify(response.body)).not.toContain('password');
  });
});
