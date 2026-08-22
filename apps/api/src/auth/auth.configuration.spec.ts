import {
  clearSessionCookieOptions,
  sessionCookieOptions,
  type AuthConfiguration,
  xsrfCookieOptions,
} from './auth.configuration';

const configuration: AuthConfiguration = {
  jwtSecret: 'test-secret',
  jwtIssuer: 'test-issuer',
  jwtAudience: 'test-audience',
  jwtExpiresInSeconds: 36_000,
  authCookieName: '__Host-academia_session',
  xsrfCookieName: 'XSRF-TOKEN',
  cookieSecure: true,
  corsOrigins: ['https://app.example.com'],
  loginRateWindowSeconds: 900,
  loginRateIpLimit: 20,
  loginRateIdentifierLimit: 5,
};

describe('authentication cookie options', () => {
  it('makes the session cookie inaccessible to JavaScript', () => {
    expect(sessionCookieOptions(configuration)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 36_000_000,
    });
  });

  it('only makes the XSRF cookie readable to JavaScript', () => {
    expect(xsrfCookieOptions(configuration)).toEqual({
      httpOnly: false,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 36_000_000,
    });
  });

  it('clears cookies using the same security scope', () => {
    expect(clearSessionCookieOptions(configuration, true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });
  });
});
