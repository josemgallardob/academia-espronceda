import { ConcurrencyLimiter } from './concurrency-limiter';

describe('ConcurrencyLimiter', () => {
  it('rejects work above the configured limit and releases the slot afterwards', async () => {
    const limiter = new ConcurrencyLimiter(1);
    let release!: () => void;
    const first = limiter.run(
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve('done');
        }),
      () => {
        throw new Error('busy');
      },
    );

    await expect(
      limiter.run(
        async () => 'second',
        () => {
          throw new Error('busy');
        },
      ),
    ).rejects.toThrow('busy');

    release();
    await expect(first).resolves.toBe('done');
    await expect(
      limiter.run(
        async () => 'third',
        () => {
          throw new Error('busy');
        },
      ),
    ).resolves.toBe('third');
  });
});
