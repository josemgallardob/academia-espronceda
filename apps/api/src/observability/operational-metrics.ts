export interface OperationalMetricsSnapshot {
  httpRequestsTotal: number;
  httpResponses: {
    '2xx': number;
    '4xx': number;
    '5xx': number;
    other: number;
  };
  lastHttpDurationMs: number | null;
  solverRequestsTotal: number;
  solverOutcomes: Record<string, number>;
  lastSolverDurationMs: number | null;
  solverInFlight: number;
  loginAttemptsTotal: number;
  loginOutcomes: Record<string, number>;
}

const emptySnapshot = (): OperationalMetricsSnapshot => ({
  httpRequestsTotal: 0,
  httpResponses: { '2xx': 0, '4xx': 0, '5xx': 0, other: 0 },
  lastHttpDurationMs: null,
  solverRequestsTotal: 0,
  solverOutcomes: {},
  lastSolverDurationMs: null,
  solverInFlight: 0,
  loginAttemptsTotal: 0,
  loginOutcomes: {},
});

let metrics = emptySnapshot();

export function resetOperationalMetrics(): void {
  metrics = emptySnapshot();
}

export function snapshotOperationalMetrics(): OperationalMetricsSnapshot {
  return {
    ...metrics,
    httpResponses: { ...metrics.httpResponses },
    solverOutcomes: { ...metrics.solverOutcomes },
    loginOutcomes: { ...metrics.loginOutcomes },
  };
}

export function recordHttpRequest(status: number, durationMs: number): void {
  metrics.httpRequestsTotal += 1;
  metrics.lastHttpDurationMs = durationMs;
  if (status >= 200 && status < 300) {
    metrics.httpResponses['2xx'] += 1;
    return;
  }
  if (status >= 400 && status < 500) {
    metrics.httpResponses['4xx'] += 1;
    return;
  }
  if (status >= 500) {
    metrics.httpResponses['5xx'] += 1;
    return;
  }
  metrics.httpResponses.other += 1;
}

export function recordSolverStart(): void {
  metrics.solverInFlight += 1;
}

export function recordSolverFinish(outcome: string, durationMs: number): void {
  metrics.solverInFlight = Math.max(0, metrics.solverInFlight - 1);
  metrics.solverRequestsTotal += 1;
  metrics.lastSolverDurationMs = durationMs;
  metrics.solverOutcomes[outcome] = (metrics.solverOutcomes[outcome] ?? 0) + 1;
}

export function recordLoginAttempt(outcome: string): void {
  metrics.loginAttemptsTotal += 1;
  metrics.loginOutcomes[outcome] = (metrics.loginOutcomes[outcome] ?? 0) + 1;
}
