import { probeSolverHealth } from './solver-health';

describe('probeSolverHealth', () => {
  it('returns ok when the solver health payload is healthy', async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ service: 'solver', status: 'ok' }), {
          status: 200,
        }),
      );

    await expect(
      probeSolverHealth('http://solver.test', fetchImpl),
    ).resolves.toBe('ok');
  });

  it('returns error on timeouts and unexpected payloads', async () => {
    const timeout: typeof fetch = async (_url, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'TimeoutError';
          reject(error);
        });
      });

    await expect(
      probeSolverHealth('http://solver.test', timeout, 1),
    ).resolves.toBe('error');
    await expect(
      probeSolverHealth('http://solver.test', () =>
        Promise.resolve(new Response(JSON.stringify({ status: 'down' }))),
      ),
    ).resolves.toBe('error');
  });
});
