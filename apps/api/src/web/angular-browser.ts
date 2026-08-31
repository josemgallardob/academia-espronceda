import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

const NEST_OPERATIONAL_PATHS = new Set(['/health', '/ready', '/metrics']);

export function resolveAngularBrowserRoot(
  fromDirectory: string = __dirname,
): string {
  return join(fromDirectory, '..', '..', '..', 'web', 'dist', 'web', 'browser');
}

export function isNestHandledPath(path: string): boolean {
  return (
    NEST_OPERATIONAL_PATHS.has(path) ||
    path === '/api' ||
    path.startsWith('/api/')
  );
}

export function serveAngularBrowser(
  app: NestExpressApplication,
  webRoot: string,
): void {
  const indexFile = join(webRoot, 'index.html');
  if (!existsSync(indexFile)) {
    throw new Error(
      `Angular production bundle is missing (${indexFile}). Build apps/web before starting the API.`,
    );
  }

  app.useStaticAssets(webRoot, {
    index: false,
    fallthrough: true,
    maxAge: '1y',
    immutable: true,
  });

  app.use((request: Request, response: Response, next: NextFunction) => {
    if (isNestHandledPath(request.path)) {
      next();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      next();
      return;
    }
    response.setHeader('Cache-Control', 'no-cache');
    response.sendFile(indexFile);
  });
}
