import { isSensitiveKey, redactText, redactValue } from './redact';

describe('redact', () => {
  it('redacts bearer tokens and JWT-shaped strings', () => {
    expect(redactText('Authorization Bearer super-secret-token')).toBe(
      'Authorization Bearer [REDACTED]',
    );
    expect(
      redactText('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.signature'),
    ).toBe('token [REDACTED]');
  });

  it('redacts nested secret fields without touching operational data', () => {
    expect(
      redactValue({
        requestId: 'req-1',
        password: 'correct horse',
        Authorization: 'Bearer abc',
        user: { id: 'user-1', jwt: 'hidden' },
      }),
    ).toEqual({
      requestId: 'req-1',
      password: '[REDACTED]',
      Authorization: '[REDACTED]',
      user: { id: 'user-1', jwt: '[REDACTED]' },
    });
  });

  it('recognizes secret key names', () => {
    expect(isSensitiveKey('INTERNAL_SERVICE_TOKEN')).toBe(true);
    expect(isSensitiveKey('requestId')).toBe(false);
  });
});
