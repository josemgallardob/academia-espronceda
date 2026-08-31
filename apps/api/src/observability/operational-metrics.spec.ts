import {
  recordHttpRequest,
  recordLoginAttempt,
  recordSolverFinish,
  recordSolverStart,
  resetOperationalMetrics,
  snapshotOperationalMetrics,
} from './operational-metrics';

describe('operational-metrics', () => {
  beforeEach(() => {
    resetOperationalMetrics();
  });

  it('counts HTTP, solver and login outcomes', () => {
    recordHttpRequest(200, 12);
    recordHttpRequest(401, 4);
    recordHttpRequest(502, 40);
    recordSolverStart();
    recordSolverFinish('SOLVER_UNAVAILABLE', 40);
    recordLoginAttempt('INVALID_CREDENTIALS');

    expect(snapshotOperationalMetrics()).toMatchObject({
      httpRequestsTotal: 3,
      httpResponses: { '2xx': 1, '4xx': 1, '5xx': 1, other: 0 },
      lastHttpDurationMs: 40,
      solverRequestsTotal: 1,
      solverOutcomes: { SOLVER_UNAVAILABLE: 1 },
      solverInFlight: 0,
      loginAttemptsTotal: 1,
      loginOutcomes: { INVALID_CREDENTIALS: 1 },
    });
  });
});
