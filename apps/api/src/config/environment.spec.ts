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
      INTERNAL_SERVICE_TOKEN: 's'.repeat(32),
      AUTH_COOKIE_NAME: '__Host-academia_session',
      COOKIE_SECURE: 'true',
      TRUST_PROXY: 'true',
    });

    expect(environment.nodeEnv).toBe('production');
    expect(environment.corsOrigins).toEqual(['https://academia.example.com']);
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
        INTERNAL_SERVICE_TOKEN: 's'.repeat(32),
        AUTH_COOKIE_NAME: '__Host-academia_session',
        COOKIE_SECURE: 'true',
        TRUST_PROXY: 'true',
      }),
    ).toThrow('DATABASE_URL must use libsql:// in production');
  });
});
