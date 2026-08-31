import { Controller, Get, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { loadApiEnvironment } from '../config/environment';
import { configureApiApplication } from '../configure-api-application';
import {
  isNestHandledPath,
  resolveAngularBrowserRoot,
  serveAngularBrowser,
} from './angular-browser';

@Controller()
class HealthStubController {
  @Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}

@Controller('api/v1/auth')
class AuthStubController {
  @Get('me')
  me(): { id: string } {
    return { id: 'user-1' };
  }
}

describe('angular browser serving', () => {
  it('resolves the Angular application-builder output from the compiled API', () => {
    expect(resolveAngularBrowserRoot('/app/apps/api/src/web')).toBe(
      '/app/apps/web/dist/web/browser',
    );
    expect(resolveAngularBrowserRoot('/app/apps/api/dist/web')).toBe(
      '/app/apps/web/dist/web/browser',
    );
  });

  it('keeps NestJS operational and API paths off the SPA fallback', () => {
    expect(isNestHandledPath('/health')).toBe(true);
    expect(isNestHandledPath('/ready')).toBe(true);
    expect(isNestHandledPath('/metrics')).toBe(true);
    expect(isNestHandledPath('/api')).toBe(true);
    expect(isNestHandledPath('/api/v1/auth/me')).toBe(true);
    expect(isNestHandledPath('/login')).toBe(false);
    expect(isNestHandledPath('/horario')).toBe(false);
    expect(isNestHandledPath('/personas')).toBe(false);
  });

  it('refuses to start when the production bundle is missing', () => {
    const webRoot = mkdtempSync(join(tmpdir(), 'academia-web-missing-'));
    const app = {
      use: () => undefined,
    } as unknown as NestExpressApplication;

    expect(() => serveAngularBrowser(app, webRoot)).toThrow(
      /Angular production bundle is missing/,
    );
  });
});

describe('configureApiApplication Angular fallback', () => {
  let app: INestApplication<App>;
  let webRoot: string;

  beforeEach(async () => {
    webRoot = mkdtempSync(join(tmpdir(), 'academia-web-'));
    writeFileSync(
      join(webRoot, 'index.html'),
      '<!doctype html><title>Academia</title><p>spa</p>',
    );
    writeFileSync(join(webRoot, 'chunk.js'), 'console.log("chunk");');

    const module = await Test.createTestingModule({
      controllers: [HealthStubController, AuthStubController],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApiApplication(
      app as NestExpressApplication,
      loadApiEnvironment({ NODE_ENV: 'test' }),
      { webRoot },
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves hashed assets and falls back to index.html for Angular routes', async () => {
    await request(app.getHttpServer())
      .get('/chunk.js')
      .expect(200)
      .expect('console.log("chunk");');

    const login = await request(app.getHttpServer()).get('/login').expect(200);
    expect(login.text).toContain('spa');
    expect(login.headers['cache-control']).toContain('no-cache');

    const schedule = await request(app.getHttpServer())
      .get('/horario')
      .expect(200);
    expect(schedule.text).toContain('spa');
  });

  it('does not capture NestJS health or API routes', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({
      status: 'ok',
    });
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(200)
      .expect({
        id: 'user-1',
      });
  });
});
