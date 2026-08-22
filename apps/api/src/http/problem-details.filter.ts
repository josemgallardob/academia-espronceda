import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ProblemDetailsException } from './problem-details.exception';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  code: string;
  traceId: string;
  fieldErrors?: Array<{ field: string; code: string; message: string }>;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const traceId = randomUUID();
    const problem = this.toProblemDetails(exception, request, traceId);

    if (problem.status >= 500) {
      this.logger.error(
        `Unhandled request failure traceId=${traceId} method=${request.method} path=${request.path}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .send(problem);
  }

  private toProblemDetails(
    exception: unknown,
    request: Request,
    traceId: string,
  ): ProblemDetails {
    if (exception instanceof ProblemDetailsException) {
      return {
        type: `urn:academia-espronceda:problem:${exception.problem.code.toLowerCase()}`,
        title: exception.problem.title,
        status: exception.problem.status,
        code: exception.problem.code,
        traceId,
        instance: request.originalUrl,
        ...(exception.problem.detail === undefined
          ? {}
          : { detail: exception.problem.detail }),
        ...(exception.problem.fieldErrors === undefined
          ? {}
          : { fieldErrors: exception.problem.fieldErrors }),
      };
    }

    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const defaults = problemDefaults(status);

    return {
      type: `urn:academia-espronceda:problem:${defaults.code.toLowerCase()}`,
      title: defaults.title,
      status,
      code: defaults.code,
      traceId,
      instance: request.originalUrl,
    };
  }
}

function problemDefaults(status: number): { code: string; title: string } {
  switch (status) {
    case 400:
      return { code: 'INVALID_REQUEST', title: 'Solicitud no válida' };
    case 401:
      return {
        code: 'AUTHENTICATION_REQUIRED',
        title: 'Autenticación requerida',
      };
    case 403:
      return { code: 'FORBIDDEN', title: 'Operación no permitida' };
    case 404:
      return { code: 'NOT_FOUND', title: 'Recurso no encontrado' };
    case 409:
      return { code: 'CONFLICT', title: 'Conflicto con el estado actual' };
    case 429:
      return {
        code: 'RATE_LIMIT_EXCEEDED',
        title: 'Demasiados intentos',
      };
    default:
      return { code: 'INTERNAL_ERROR', title: 'Error interno del servidor' };
  }
}
