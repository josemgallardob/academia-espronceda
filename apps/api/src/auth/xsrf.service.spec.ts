import type { AuthConfiguration } from './auth.configuration';
import { XsrfService } from './xsrf.service';

const configuration: AuthConfiguration = {
  jwtSecret: 'a-secret-used-only-by-the-xsrf-unit-test',
  jwtIssuer: 'test-issuer',
  jwtAudience: 'test-audience',
  jwtExpiresInSeconds: 36_000,
  authCookieName: 'session',
  xsrfCookieName: 'XSRF-TOKEN',
  cookieSecure: false,
  corsOrigins: ['http://frontend.test'],
  loginRateWindowSeconds: 900,
  loginRateIpLimit: 20,
  loginRateIdentifierLimit: 5,
};

describe('XsrfService', () => {
  const service = new XsrfService(configuration);

  it('binds the XSRF token to the HttpOnly session token', () => {
    const token = service.createToken('session-a');

    expect(service.isValid('session-a', token, token)).toBe(true);
    expect(service.isValid('session-b', token, token)).toBe(false);
  });

  it('requires both matching cookie and header values', () => {
    const token = service.createToken('session-a');

    expect(service.isValid('session-a', undefined, token)).toBe(false);
    expect(service.isValid('session-a', token, undefined)).toBe(false);
    expect(service.isValid('session-a', token, `${token}x`)).toBe(false);
  });
});
