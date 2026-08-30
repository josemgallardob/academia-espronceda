import { loadApiEnvironment } from '../config/environment';
import { ProblemDetailsException } from '../http/problem-details.exception';
import { ConcurrencyLimiter } from '../observability/concurrency-limiter';
import {
  recordSolverFinish,
  recordSolverStart,
} from '../observability/operational-metrics';
import { currentRequestId } from '../observability/request-context';
import { writeStructuredLog } from '../observability/structured-log';
import {
  parseSolveScheduleResponse,
  solverHttpTimeoutMs,
  SolverResponseParseError,
  type ScheduleSolver,
  type SolveScheduleRequest,
  type SolveScheduleResponse,
} from './solver-contract';
import {
  generationBusy,
  solverInvalidResponse,
  solverUnavailable,
} from './solver-errors';

export interface SolverHttpClientOptions {
  baseUrl: string;
  serviceToken: string;
  fetchImpl?: typeof fetch;
  timeoutBufferSeconds?: number;
  maxConcurrent?: number;
  limiter?: ConcurrencyLimiter;
}

export class SolverHttpClient implements ScheduleSolver {
  private readonly baseUrl: string;
  private readonly serviceToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutBufferSeconds: number | undefined;
  private readonly limiter: ConcurrencyLimiter;

  constructor(options?: SolverHttpClientOptions) {
    const environment = loadApiEnvironment();
    this.baseUrl = (options?.baseUrl ?? environment.solverUrl).replace(
      /\/$/,
      '',
    );
    this.serviceToken =
      options?.serviceToken ?? environment.internalServiceToken;
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.timeoutBufferSeconds =
      options?.timeoutBufferSeconds ?? environment.solverTimeoutBufferSeconds;
    this.limiter =
      options?.limiter ??
      new ConcurrencyLimiter(
        options?.maxConcurrent ?? environment.solverMaxConcurrent,
      );
  }

  async solve(request: SolveScheduleRequest): Promise<SolveScheduleResponse> {
    return this.limiter.run(
      () => this.invokeSolver(request),
      () => {
        writeStructuredLog({
          level: 'warn',
          event: 'solver.busy',
          requestId: request.requestId,
        });
        throw generationBusy();
      },
    );
  }

  private async invokeSolver(
    request: SolveScheduleRequest,
  ): Promise<SolveScheduleResponse> {
    const timeoutMs = solverHttpTimeoutMs(
      request.options.timeLimitSeconds,
      this.timeoutBufferSeconds,
    );
    const requestId = currentRequestId() ?? request.requestId;
    const startedAt = Date.now();
    recordSolverStart();
    writeStructuredLog({
      level: 'info',
      event: 'solver.request',
      requestId,
      timeLimitSeconds: request.options.timeLimitSeconds,
      timeoutMs,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1/schedules/solve`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.serviceToken}`,
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      finishSolverCall('SOLVER_UNAVAILABLE', requestId, startedAt);
      throw solverUnavailable(networkFailureDetail(error));
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      const error = mapFailedStatus(
        response.status,
        payload.ok ? payload.value : undefined,
      );
      finishSolverCall(error.problem.code, requestId, startedAt);
      throw error;
    }
    if (!payload.ok) {
      finishSolverCall('SOLVER_INVALID_RESPONSE', requestId, startedAt);
      throw solverInvalidResponse('The solver response was not valid JSON.');
    }
    try {
      const parsed = parseSolveScheduleResponse(payload.value);
      finishSolverCall(parsed.status, requestId, startedAt, {
        mode: parsed.mode,
      });
      return parsed;
    } catch (error) {
      finishSolverCall('SOLVER_INVALID_RESPONSE', requestId, startedAt);
      throw error instanceof ProblemDetailsException
        ? error
        : solverInvalidResponse(
            error instanceof SolverResponseParseError
              ? error.message
              : 'The solver response could not be parsed.',
          );
    }
  }
}

function finishSolverCall(
  outcome: string,
  requestId: string,
  startedAt: number,
  extra: Record<string, unknown> = {},
): void {
  const durationMs = Date.now() - startedAt;
  recordSolverFinish(outcome, durationMs);
  writeStructuredLog({
    level:
      outcome.startsWith('SOLVER_') || outcome === 'GENERATION_BUSY'
        ? 'error'
        : 'info',
    event: 'solver.response',
    requestId,
    outcome,
    durationMs,
    ...extra,
  });
}

async function readPayload(
  response: Response,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const text = await response.text();
  if (text.length === 0) {
    return { ok: true, value: null };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function mapFailedStatus(
  status: number,
  payload: unknown,
): ReturnType<typeof solverUnavailable> {
  const detail = problemDetail(payload);
  if (status === 503) {
    return generationBusy();
  }
  if (status >= 500 || status === 401 || status === 403 || status === 404) {
    return solverUnavailable(detail);
  }
  return solverInvalidResponse(detail ?? `Solver returned HTTP ${status}.`);
}

function problemDetail(payload: unknown): string | undefined {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'detail' in payload &&
    typeof payload.detail === 'string' &&
    payload.detail.length > 0
  ) {
    return payload.detail;
  }
  return undefined;
}

function networkFailureDetail(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return 'The solver request exceeded the allowed time.';
    }
    return error.message;
  }
  return 'The solver request failed.';
}
