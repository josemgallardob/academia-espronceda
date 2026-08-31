export type RuntimeEnvironment = 'development' | 'test' | 'production';

export interface ApiEnvironment {
  nodeEnv: RuntimeEnvironment;
  host: string;
  port: number;
  corsOrigins: string[];
  solverUrl: string;
  databaseUrl: string;
  databaseAuthToken?: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtExpiresInSeconds: number;
  internalServiceToken: string;
  authCookieName: string;
  xsrfCookieName: string;
  loginRateWindowSeconds: number;
  loginRateIpLimit: number;
  loginRateIdentifierLimit: number;
  cookieSecure: boolean;
  trustProxy: boolean;
  solverTimeoutBufferSeconds: number;
  solverMaxConcurrent: number;
}

const DEVELOPMENT_DEFAULTS = {
  API_HOST: '127.0.0.1',
  API_PORT: '3000',
  API_CORS_ORIGINS: 'http://localhost:4200,http://127.0.0.1:4200',
  SOLVER_URL: 'http://127.0.0.1:8001',
  DATABASE_URL: 'file:./.data/academia-espronceda.db',
  JWT_SECRET: 'local-only-jwt-secret-replace-in-every-deployed-environment',
  JWT_ISSUER: 'academia-espronceda-api',
  JWT_AUDIENCE: 'academia-espronceda-web',
  JWT_TTL_SECONDS: '36000',
  INTERNAL_SERVICE_TOKEN:
    'local-only-service-token-replace-in-every-deployed-environment',
  AUTH_COOKIE_NAME: 'academia_session',
  XSRF_COOKIE_NAME: 'XSRF-TOKEN',
  AUTH_LOGIN_RATE_WINDOW_SECONDS: '900',
  AUTH_LOGIN_IP_LIMIT: '20',
  AUTH_LOGIN_IDENTIFIER_LIMIT: '5',
  COOKIE_SECURE: 'false',
  TRUST_PROXY: 'false',
} as const;

export function loadApiEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): ApiEnvironment {
  const nodeEnv = readNodeEnvironment(source.NODE_ENV);
  const value = (name: keyof typeof DEVELOPMENT_DEFAULTS): string => {
    const configured = source[name]?.trim();
    if (configured) {
      return configured;
    }

    if (nodeEnv !== 'production') {
      return DEVELOPMENT_DEFAULTS[name];
    }

    throw new Error(`${name} must be configured in production`);
  };

  const corsOrigins = parseOrigins(value('API_CORS_ORIGINS'), nodeEnv);
  const solverUrl = parseUrl(value('SOLVER_URL'), 'SOLVER_URL');
  const databaseUrl = value('DATABASE_URL');
  const jwtSecret = value('JWT_SECRET');
  const jwtIssuer = value('JWT_ISSUER');
  const jwtAudience = value('JWT_AUDIENCE');
  const jwtExpiresInSeconds = parseIntegerInRange(
    value('JWT_TTL_SECONDS'),
    'JWT_TTL_SECONDS',
    28_800,
    43_200,
  );
  const internalServiceToken = value('INTERNAL_SERVICE_TOKEN');
  const authCookieName = value('AUTH_COOKIE_NAME');
  const xsrfCookieName = value('XSRF_COOKIE_NAME');
  const loginRateWindowSeconds = parseIntegerInRange(
    value('AUTH_LOGIN_RATE_WINDOW_SECONDS'),
    'AUTH_LOGIN_RATE_WINDOW_SECONDS',
    60,
    3_600,
  );
  const loginRateIpLimit = parseIntegerInRange(
    value('AUTH_LOGIN_IP_LIMIT'),
    'AUTH_LOGIN_IP_LIMIT',
    1,
    1_000,
  );
  const loginRateIdentifierLimit = parseIntegerInRange(
    value('AUTH_LOGIN_IDENTIFIER_LIMIT'),
    'AUTH_LOGIN_IDENTIFIER_LIMIT',
    1,
    100,
  );
  const cookieSecure = parseBoolean(value('COOKIE_SECURE'), 'COOKIE_SECURE');
  const trustProxy = parseBoolean(value('TRUST_PROXY'), 'TRUST_PROXY');
  const solverTimeoutBufferSeconds = parseOptionalIntegerInRange(
    source.SOLVER_TIMEOUT_BUFFER_SECONDS,
    'SOLVER_TIMEOUT_BUFFER_SECONDS',
    0,
    60,
    5,
  );
  const solverMaxConcurrent = parseOptionalIntegerInRange(
    source.SOLVER_MAX_CONCURRENT,
    'SOLVER_MAX_CONCURRENT',
    1,
    8,
    1,
  );

  if (nodeEnv === 'production') {
    assertProductionConfiguration({
      source,
      corsOrigins,
      solverUrl,
      databaseUrl,
      jwtSecret,
      jwtIssuer,
      jwtAudience,
      internalServiceToken,
      authCookieName,
      cookieSecure,
      trustProxy,
    });
  }

  return {
    nodeEnv,
    host: value('API_HOST'),
    port: parsePort(
      source.API_PORT?.trim() || source.PORT?.trim() || value('API_PORT'),
      'API_PORT',
    ),
    corsOrigins,
    solverUrl: solverUrl.toString(),
    databaseUrl,
    databaseAuthToken: source.DATABASE_AUTH_TOKEN?.trim() || undefined,
    jwtSecret,
    jwtIssuer,
    jwtAudience,
    jwtExpiresInSeconds,
    internalServiceToken,
    authCookieName,
    xsrfCookieName,
    loginRateWindowSeconds,
    loginRateIpLimit,
    loginRateIdentifierLimit,
    cookieSecure,
    trustProxy,
    solverTimeoutBufferSeconds,
    solverMaxConcurrent,
  };
}

function readNodeEnvironment(value: string | undefined): RuntimeEnvironment {
  const environment = value?.trim() || 'development';
  if (
    environment !== 'development' &&
    environment !== 'test' &&
    environment !== 'production'
  ) {
    throw new Error('NODE_ENV must be one of development, test, or production');
  }

  return environment;
}

function parsePort(value: string, name: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }

  return port;
}

function parseOptionalIntegerInRange(
  value: string | undefined,
  name: string,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const configured = value?.trim();
  if (!configured) {
    return fallback;
  }
  return parseIntegerInRange(configured, name, minimum, maximum);
}

function parseIntegerInRange(
  value: string,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const parsedValue = Number(value);
  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < minimum ||
    parsedValue > maximum
  ) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return parsedValue;
}

function parseBoolean(value: string, name: string): boolean {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }

  throw new Error(`${name} must be either true or false`);
}

function parseUrl(value: string, name: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error();
    }
    return url;
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }
}

function parseOrigins(value: string, nodeEnv: RuntimeEnvironment): string[] {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      if (origin === '*') {
        throw new Error('API_CORS_ORIGINS cannot contain a wildcard');
      }

      const url = parseUrl(origin, 'API_CORS_ORIGINS');
      if (url.pathname !== '/' || url.search || url.hash) {
        throw new Error(
          'API_CORS_ORIGINS entries must contain only scheme, host, and optional port',
        );
      }
      if (nodeEnv === 'production' && url.protocol !== 'https:') {
        throw new Error('API_CORS_ORIGINS must use HTTPS in production');
      }

      return url.origin;
    });

  if (origins.length === 0) {
    throw new Error('API_CORS_ORIGINS must contain at least one origin');
  }

  return [...new Set(origins)];
}

function assertProductionConfiguration(configuration: {
  source: NodeJS.ProcessEnv;
  corsOrigins: string[];
  solverUrl: URL;
  databaseUrl: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  internalServiceToken: string;
  authCookieName: string;
  cookieSecure: boolean;
  trustProxy: boolean;
}): void {
  if (!configuration.databaseUrl.startsWith('libsql://')) {
    throw new Error('DATABASE_URL must use libsql:// in production');
  }
  if (!configuration.source.DATABASE_AUTH_TOKEN?.trim()) {
    throw new Error('DATABASE_AUTH_TOKEN must be configured in production');
  }
  if (configuration.jwtSecret.length < 64) {
    throw new Error(
      'JWT_SECRET must contain at least 64 characters in production',
    );
  }
  if (
    configuration.jwtIssuer.includes('<') ||
    configuration.jwtAudience.includes('<')
  ) {
    throw new Error(
      'JWT issuer and audience still contain example placeholders',
    );
  }
  if (configuration.internalServiceToken.length < 32) {
    throw new Error(
      'INTERNAL_SERVICE_TOKEN must contain at least 32 characters in production',
    );
  }
  if (!configuration.cookieSecure) {
    throw new Error('COOKIE_SECURE must be true in production');
  }
  if (!configuration.trustProxy) {
    throw new Error('TRUST_PROXY must be true in production');
  }
  if (!configuration.authCookieName.startsWith('__Host-')) {
    throw new Error(
      'AUTH_COOKIE_NAME must use the __Host- prefix in production',
    );
  }
  if (
    configuration.solverUrl.hostname === 'localhost' ||
    configuration.solverUrl.hostname === '127.0.0.1'
  ) {
    throw new Error(
      'SOLVER_URL must point to the private solver service in production',
    );
  }
  if (configuration.corsOrigins.some((origin) => origin.includes('<'))) {
    throw new Error('API_CORS_ORIGINS still contains an example placeholder');
  }
}
