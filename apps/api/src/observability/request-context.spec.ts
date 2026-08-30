import {
  currentOrNewRequestId,
  currentRequestId,
  resolveRequestId,
  runWithRequestId,
} from './request-context';

describe('request-context', () => {
  it('accepts a safe incoming request id and rejects unsafe values', () => {
    expect(resolveRequestId('req-abc_1.2')).toBe('req-abc_1.2');
    expect(resolveRequestId('not a valid id')).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
    expect(resolveRequestId('')).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('exposes the request id only inside the active context', () => {
    expect(currentRequestId()).toBeUndefined();
    const seen = runWithRequestId('corr-1', () => currentRequestId());
    expect(seen).toBe('corr-1');
    expect(currentOrNewRequestId()).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
