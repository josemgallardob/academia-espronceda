import { Test, TestingModule } from '@nestjs/testing';
import { AppController, readinessHttpStatus } from './app.controller';
import { AppService, readinessStatus } from './app.service';
import { DatabaseConnection } from './database/database.connection';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: DatabaseConnection,
          useValue: { ping: async () => undefined },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should report that the API is healthy', () => {
      expect(appController.getHealth()).toEqual({
        service: 'api',
        status: 'ok',
      });
    });
  });
});

describe('readinessStatus', () => {
  it('keeps the API ready when only the solver is down', () => {
    expect(readinessStatus('ok', 'ok')).toBe('ok');
    expect(readinessStatus('ok', 'error')).toBe('degraded');
    expect(readinessStatus('error', 'ok')).toBe('error');
    expect(readinessHttpStatus({ service: 'api', status: 'degraded', checks: { database: 'ok', solver: 'error' } })).toBe(200);
    expect(readinessHttpStatus({ service: 'api', status: 'error', checks: { database: 'error', solver: 'ok' } })).toBe(503);
  });
});
