import { loadApiEnvironment } from './environment';

describe('loadApiEnvironment', () => {
  it('provides safe local defaults for development', () => {
    const environment = loadApiEnvironment({});

    expect(environment).toMatchObject({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 3000,
      databaseUrl: 'file:./.data/academia-espronceda.db',
      cookieSecure: false,
      trustProxy: false,
      jwtIssuer: 'academia-espronceda-api',
      jwtAudience: 'academia-espronceda-web',
      jwtExpiresInSeconds: 36_000,
      xsrfCookieName: 'XSRF-TOKEN',
      loginRateWindowSeconds: 900,
      loginRateIpLimit: 20,
      loginRateIdentifierLimit: 5,
      solverTimeoutBufferSeconds: 5,
      solverMaxConcurrent: 1,
    });
    expect(environment.corsOrigins).toEqual([
      'http://localhost:4200',
      'http://127.0.0.1:4200',
    ]);
  });

  it('rejects a wildcard CORS origin', () => {
    expect(() => loadApiEnvironment({ API_CORS_ORIGINS: '*' })).toThrow(
      'API_CORS_ORIGINS cannot contain a wildcard',
    );
  });

  it('restricts session duration to the approved range of 8 to 12 hours', () => {
    expect(() => loadApiEnvironment({ JWT_TTL_SECONDS: '28799' })).toThrow(
      'JWT_TTL_SECONDS must be an integer between 28800 and 43200',
    );
    expect(() => loadApiEnvironment({ JWT_TTL_SECONDS: '43201' })).toThrow(
      'JWT_TTL_SECONDS must be an integer between 28800 and 43200',
    );
  });

  it('accepts a complete production configuration', () => {
    const environment = loadApiEnvironment({
      NODE_ENV: 'production',
      API_HOST: '0.0.0.0',
      API_PORT: '3000',
      API_CORS_ORIGINS: 'https://academia.example.com',
      SOLVER_URL: 'http://solver.internal:8001',
      DATABASE_URL: 'libsql://database.turso.io',
      DATABASE_AUTH_TOKEN: 'database-token',
      JWT_SECRET: 'j'.repeat(64),
      JWT_ISSUER: 'academia-espronceda-api',
      JWT_AUDIENCE: 'academia-espronceda-web',
      JWT_TTL_SECONDS: '36000',
      INTERNAL_SERVICE_TOKEN: 's'.repeat(32),
      AUTH_COOKIE_NAME: '__Host-academia_session',
      XSRF_COOKIE_NAME: 'XSRF-TOKEN',
      AUTH_LOGIN_RATE_WINDOW_SECONDS: '900',
      AUTH_LOGIN_IP_LIMIT: '20',
      AUTH_LOGIN_IDENTIFIER_LIMIT: '5',
      COOKIE_SECURE: 'true',
      TRUST_PROXY: 'true',
    });

    expect(environment.nodeEnv).toBe('production');
    expect(environment.corsOrigins).toEqual(['https://academia.example.com']);
    expect(environment.solverTimeoutBufferSeconds).toBe(5);
    expect(environment.solverMaxConcurrent).toBe(1);
  });

  it('accepts operational solver timeout and concurrency overrides', () => {
    const environment = loadApiEnvironment({
      SOLVER_TIMEOUT_BUFFER_SECONDS: '8',
      SOLVER_MAX_CONCURRENT: '2',
    });

    expect(environment.solverTimeoutBufferSeconds).toBe(8);
    expect(environment.solverMaxConcurrent).toBe(2);
  });

  it('rejects solver operational limits outside the approved range', () => {
    expect(() =>
      loadApiEnvironment({ SOLVER_TIMEOUT_BUFFER_SECONDS: '61' }),
    ).toThrow('SOLVER_TIMEOUT_BUFFER_SECONDS must be an integer between 0 and 60');
    expect(() => loadApiEnvironment({ SOLVER_MAX_CONCURRENT: '0' })).toThrow(
      'SOLVER_MAX_CONCURRENT must be an integer between 1 and 8',
    );
  });

  it('rejects a local database in production', () => {
    expect(() =>
      loadApiEnvironment({
        NODE_ENV: 'production',
        API_HOST: '0.0.0.0',
        API_PORT: '3000',
        API_CORS_ORIGINS: 'https://academia.example.com',
        SOLVER_URL: 'http://solver.internal:8001',
        DATABASE_URL: 'file:./production.db',
        DATABASE_AUTH_TOKEN: 'database-token',
        JWT_SECRET: 'j'.repeat(64),
        JWT_ISSUER: 'academia-espronceda-api',
        JWT_AUDIENCE: 'academia-espronceda-web',
        JWT_TTL_SECONDS: '36000',
        INTERNAL_SERVICE_TOKEN: 's'.repeat(32),
        AUTH_COOKIE_NAME: '__Host-academia_session',
        XSRF_COOKIE_NAME: 'XSRF-TOKEN',
        AUTH_LOGIN_RATE_WINDOW_SECONDS: '900',
        AUTH_LOGIN_IP_LIMIT: '20',
        AUTH_LOGIN_IDENTIFIER_LIMIT: '5',
        COOKIE_SECURE: 'true',
        TRUST_PROXY: 'true',
      }),
    ).toThrow('DATABASE_URL must use libsql:// in production');
  });
});
