import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
}

export interface SessionResponse {
  user: AuthenticatedUser;
}

export interface SessionClaims {
  sub: string;
  username: string;
  tokenVersion: number;
}

export interface AuthenticatedRequest extends Request {
  cookies: Record<string, string | undefined>;
  authenticatedUser?: AuthenticatedUser;
  sessionToken?: string;
}
