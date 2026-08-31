import type { NextFunction, Request, Response } from 'express';
import { recordHttpRequest } from './operational-metrics';
import { resolveRequestId, runWithRequestId } from './request-context';
import { writeStructuredLog } from './structured-log';

const QUIET_PATHS = new Set(['/health', '/ready', '/metrics']);

export function httpObservabilityMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = resolveRequestId(request.header('x-request-id'));
  response.setHeader('X-Request-Id', requestId);
  const startedAt = Date.now();

  response.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    recordHttpRequest(response.statusCode, durationMs);
    if (QUIET_PATHS.has(request.path)) {
      return;
    }
    writeStructuredLog({
      level: response.statusCode >= 500 ? 'error' : 'info',
      event: 'http.request',
      requestId,
      method: request.method,
      path: request.path,
      status: response.statusCode,
      durationMs,
    });
  });

  runWithRequestId(requestId, () => {
    next();
  });
}
