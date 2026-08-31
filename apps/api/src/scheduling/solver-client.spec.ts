import { ProblemDetailsException } from '../http/problem-details.exception';
import { SolverHttpClient } from './solver-client';
import {
  parseSolveScheduleResponse,
  solverHttpTimeoutMs,
  type SolveScheduleRequest,
  type SolveScheduleResponse,
} from './solver-contract';

describe('SolverHttpClient', () => {
  const request: SolveScheduleRequest = {
    contractVersion: '1.0.0',
    ruleCatalogVersion: '1.0.0',
    requestId: 'request-1',
    timezone: 'Europe/Madrid',
    slots: [
      {
        id: 'slot-monday-1600',
        dayOfWeek: 'MONDAY',
        startTime: '16:00',
        endTime: '17:00',
      },
    ],
    teachers: [
      {
        id: 'teacher-1',
        profile: 'GENERAL_SCIENCES',
        supportedCourseCodes: ['BACH_1'],
        supportedSubjectCodes: ['MATHEMATICS'],
        availableSlotIds: ['slot-monday-1600'],
      },
    ],
    students: [],
    relationships: [],
    options: { timeLimitSeconds: 10, randomSeed: 1 },
  };

  it('computes an HTTP timeout covering both solver attempts plus a buffer', () => {
    expect(solverHttpTimeoutMs(10)).toBe(25_000);
    expect(solverHttpTimeoutMs(10, 0)).toBe(20_000);
  });

  it('posts the solve contract with the internal service token', async () => {
    let fetchCalls = 0;
    const fetchImpl: typeof fetch = (url, init) => {
      fetchCalls += 1;
      expect(url).toBe('http://solver.test/v1/schedules/solve');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({
        Accept: 'application/json',
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
        'X-Request-Id': 'request-1',
      });
      expect(init?.body).toContain('"requestId":"request-1"');
      return Promise.resolve(jsonResponse(200, optimalResponse(request)));
    };
    const client = new SolverHttpClient({
      baseUrl: 'http://solver.test/',
      serviceToken: 'test-token',
      fetchImpl,
    });

    await expect(client.solve(request)).resolves.toMatchObject({
      status: 'OPTIMAL',
      requestId: 'request-1',
    });
    expect(fetchCalls).toBe(1);
  });

  it('retries connection failures and gateway 502 responses while the solver wakes', async () => {
    const delays: number[] = [];
    let fetchCalls = 0;
    const fetchImpl: typeof fetch = () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return Promise.reject(new TypeError('fetch failed'));
      }
      if (fetchCalls === 2) {
        return Promise.resolve(jsonResponse(502, { detail: 'upstream' }));
      }
      return Promise.resolve(jsonResponse(200, optimalResponse(request)));
    };
    const client = new SolverHttpClient({
      baseUrl: 'http://solver.test',
      serviceToken: 'test-token',
      fetchImpl,
      coldStartBackoffMs: [5, 5],
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });

    await expect(client.solve(request)).resolves.toMatchObject({
      status: 'OPTIMAL',
      requestId: 'request-1',
    });
    expect(fetchCalls).toBe(3);
    expect(delays).toEqual([5, 5]);
  });

  it('does not retry solver timeouts or an in-progress generation', async () => {
    let timeoutCalls = 0;
    const timeoutClient = new SolverHttpClient({
      baseUrl: 'http://solver.test',
      serviceToken: 'test-token',
      timeoutBufferSeconds: 0,
      coldStartBackoffMs: [5],
      sleep: () =>
        Promise.reject(new Error('should not sleep after a solve timeout')),
      fetchImpl: async (_url, init) =>
        await new Promise<Response>((_resolve, reject) => {
          timeoutCalls += 1;
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'TimeoutError';
            reject(error);
          });
        }),
    });
    await expect(
      timeoutClient.solve({
        ...request,
        options: { ...request.options, timeLimitSeconds: 0.001 },
      }),
    ).rejects.toMatchObject({
      problem: { status: 502, code: 'SOLVER_UNAVAILABLE' },
    });
    expect(timeoutCalls).toBe(1);

    let busyCalls = 0;
    const busyClient = new SolverHttpClient({
      baseUrl: 'http://solver.test',
      serviceToken: 'test-token',
      coldStartBackoffMs: [5],
      sleep: () =>
        Promise.reject(new Error('should not sleep after SOLVER_BUSY')),
      fetchImpl: () => {
        busyCalls += 1;
        return Promise.resolve(
          jsonResponse(503, {
            code: 'SOLVER_BUSY',
            detail: 'already running',
          }),
        );
      },
    });
    await expect(busyClient.solve(request)).rejects.toMatchObject({
      problem: { status: 503, code: 'GENERATION_BUSY' },
    });
    expect(busyCalls).toBe(1);
  });

  it('maps timeouts and 5xx failures to SOLVER_UNAVAILABLE', async () => {
    const timeoutClient = new SolverHttpClient({
      baseUrl: 'http://solver.test',
      serviceToken: 'test-token',
      timeoutBufferSeconds: 0,
      fetchImpl: async (_url, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'TimeoutError';
            reject(error);
          });
        }),
    });
    await expect(
      timeoutClient.solve({
        ...request,
        options: { ...request.options, timeLimitSeconds: 0.001 },
      }),
    ).rejects.toMatchObject({
      problem: { status: 502, code: 'SOLVER_UNAVAILABLE' },
    });

    const serverErrorClient = new SolverHttpClient({
      baseUrl: 'http://solver.test',
      serviceToken: 'test-token',
      fetchImpl: () =>
        Promise.resolve(jsonResponse(500, { detail: 'engine exploded' })),
    });
    await expect(serverErrorClient.solve(request)).rejects.toBeInstanceOf(
      ProblemDetailsException,
    );
    await expect(serverErrorClient.solve(request)).rejects.toMatchObject({
      problem: {
        status: 502,
        code: 'SOLVER_UNAVAILABLE',
        detail: 'engine exploded',
      },
    });
  });

  it('maps contract violations and malformed payloads to SOLVER_INVALID_RESPONSE', async () => {
    const unprocessable = new SolverHttpClient({
      baseUrl: 'http://solver.test',
      serviceToken: 'test-token',
      fetchImpl: () =>
        Promise.resolve(
          jsonResponse(422, { detail: 'unsupported contract version' }),
        ),
    });
    await expect(unprocessable.solve(request)).rejects.toMatchObject({
      problem: { status: 502, code: 'SOLVER_INVALID_RESPONSE' },
    });

    const malformed = new SolverHttpClient({
      baseUrl: 'http://solver.test',
      serviceToken: 'test-token',
      fetchImpl: () =>
        Promise.resolve(jsonResponse(200, { status: 'OPTIMAL' })),
    });
    await expect(malformed.solve(request)).rejects.toMatchObject({
      problem: { status: 502, code: 'SOLVER_INVALID_RESPONSE' },
    });
  });

  it('rejects a second solve while the concurrency limit is held', async () => {
    let release!: () => void;
    const held = new SolverHttpClient({
      baseUrl: 'http://solver.test',
      serviceToken: 'test-token',
      maxConcurrent: 1,
      fetchImpl: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(jsonResponse(200, optimalResponse(request)));
        }),
    });

    const first = held.solve(request);
    await expect(held.solve(request)).rejects.toMatchObject({
      problem: { status: 503, code: 'GENERATION_BUSY' },
    });
    release();
    await expect(first).resolves.toMatchObject({ requestId: 'request-1' });
  });

  it('parses a usable solver payload', () => {
    expect(parseSolveScheduleResponse(optimalResponse(request))).toMatchObject({
      status: 'OPTIMAL',
      solution: { classes: [{ id: 'class-1' }] },
    });
  });
});

function optimalResponse(request: SolveScheduleRequest): SolveScheduleResponse {
  return {
    contractVersion: request.contractVersion,
    ruleCatalogVersion: request.ruleCatalogVersion,
    requestId: request.requestId,
    mode: 'STRICT',
    status: 'OPTIMAL',
    attempts: [{ mode: 'STRICT', status: 'OPTIMAL', elapsedMilliseconds: 3 }],
    solution: {
      classes: [
        {
          id: 'class-1',
          teacherId: 'teacher-1',
          slotId: 'slot-monday-1600',
          studentIds: [],
        },
      ],
      subjectTeacherAllocations: [],
      score: {
        direction: 'MINIMIZE',
        bestScore: 0,
        tiers: [1, 2, 3, 4, 5, 6].map((priority) => ({
          priority,
          penalty: 0,
        })),
        ruleBreakdown: [],
      },
      findings: [],
    },
    elapsedMilliseconds: 3,
    randomSeed: request.options.randomSeed,
    timeLimitSeconds: request.options.timeLimitSeconds,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
