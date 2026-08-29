import { loadApiEnvironment } from '../config/environment';
import {
  parseSolveScheduleResponse,
  solverHttpTimeoutMs,
  SolverResponseParseError,
  type ScheduleSolver,
  type SolveScheduleRequest,
  type SolveScheduleResponse,
} from './solver-contract';
import { solverInvalidResponse, solverUnavailable } from './solver-errors';

export interface SolverHttpClientOptions {
  baseUrl: string;
  serviceToken: string;
  fetchImpl?: typeof fetch;
  timeoutBufferSeconds?: number;
}

export class SolverHttpClient implements ScheduleSolver {
  private readonly baseUrl: string;
  private readonly serviceToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutBufferSeconds: number | undefined;

  constructor(options?: SolverHttpClientOptions) {
    const environment = loadApiEnvironment();
    this.baseUrl = (options?.baseUrl ?? environment.solverUrl).replace(
      /\/$/,
      '',
    );
    this.serviceToken =
      options?.serviceToken ?? environment.internalServiceToken;
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.timeoutBufferSeconds = options?.timeoutBufferSeconds;
  }

  async solve(request: SolveScheduleRequest): Promise<SolveScheduleResponse> {
    const timeoutMs = solverHttpTimeoutMs(
      request.options.timeLimitSeconds,
      this.timeoutBufferSeconds,
    );
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1/schedules/solve`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.serviceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw solverUnavailable(networkFailureDetail(error));
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      throw mapFailedStatus(
        response.status,
        payload.ok ? payload.value : undefined,
      );
    }
    if (!payload.ok) {
      throw solverInvalidResponse('The solver response was not valid JSON.');
    }
    try {
      return parseSolveScheduleResponse(payload.value);
    } catch (error) {
      throw solverInvalidResponse(
        error instanceof SolverResponseParseError
          ? error.message
          : 'The solver response could not be parsed.',
      );
    }
  }
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
