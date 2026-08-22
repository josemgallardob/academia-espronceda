import type { CookieOptions } from 'express';
import { loadApiEnvironment } from '../config/environment';

export interface AuthConfiguration {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtExpiresInSeconds: number;
  authCookieName: string;
  xsrfCookieName: string;
  cookieSecure: boolean;
  corsOrigins: string[];
  loginRateWindowSeconds: number;
  loginRateIpLimit: number;
  loginRateIdentifierLimit: number;
}

export function loadAuthConfiguration(): AuthConfiguration {
  const environment = loadApiEnvironment();
  return {
    jwtSecret: environment.jwtSecret,
    jwtIssuer: environment.jwtIssuer,
    jwtAudience: environment.jwtAudience,
    jwtExpiresInSeconds: environment.jwtExpiresInSeconds,
    authCookieName: environment.authCookieName,
    xsrfCookieName: environment.xsrfCookieName,
    cookieSecure: environment.cookieSecure,
    corsOrigins: environment.corsOrigins,
    loginRateWindowSeconds: environment.loginRateWindowSeconds,
    loginRateIpLimit: environment.loginRateIpLimit,
    loginRateIdentifierLimit: environment.loginRateIdentifierLimit,
  };
}

export function sessionCookieOptions(
  configuration: AuthConfiguration,
): CookieOptions {
  return {
    httpOnly: true,
    secure: configuration.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: configuration.jwtExpiresInSeconds * 1_000,
  };
}

export function xsrfCookieOptions(
  configuration: AuthConfiguration,
): CookieOptions {
  return {
    ...sessionCookieOptions(configuration),
    httpOnly: false,
  };
}

export function clearSessionCookieOptions(
  configuration: AuthConfiguration,
  httpOnly: boolean,
): CookieOptions {
  return {
    httpOnly,
    secure: configuration.cookieSecure,
    sameSite: 'strict',
    path: '/',
  };
}
