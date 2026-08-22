export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
}

export interface SessionResponse {
  user: AuthenticatedUser;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  traceId: string;
  detail?: string | null;
}

export type AuthenticationState = 'checking' | 'authenticated' | 'anonymous';
