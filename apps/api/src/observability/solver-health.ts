const DEFAULT_TIMEOUT_MS = 2_000;

export async function probeSolverHealth(
  solverUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<'ok' | 'error'> {
  const baseUrl = solverUrl.replace(/\/$/, '');
  try {
    const response = await fetchImpl(`${baseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return 'error';
    }
    const payload = (await response.json()) as { status?: unknown };
    return payload.status === 'ok' ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}
