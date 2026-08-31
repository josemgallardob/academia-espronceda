import { setStructuredLogWriter, writeStructuredLog } from './structured-log';
import { runWithRequestId } from './request-context';

describe('structured-log', () => {
  const lines: string[] = [];

  beforeEach(() => {
    lines.length = 0;
    setStructuredLogWriter((line) => lines.push(line));
  });

  afterEach(() => {
    setStructuredLogWriter();
  });

  it('writes one JSON object per line and redacts secrets', () => {
    runWithRequestId('corr-9', () => {
      writeStructuredLog({
        level: 'info',
        event: 'auth.login',
        password: 'never-log-this',
        Authorization: 'Bearer secret-token',
      });
    });

    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(record).toMatchObject({
      service: 'api',
      level: 'info',
      event: 'auth.login',
      requestId: 'corr-9',
      password: '[REDACTED]',
      Authorization: '[REDACTED]',
    });
    expect(JSON.stringify(record)).not.toContain('never-log-this');
    expect(JSON.stringify(record)).not.toContain('secret-token');
  });
});
