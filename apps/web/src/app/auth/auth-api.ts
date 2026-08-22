import { environment } from '../../environments/environment';

const apiBaseUrl = environment.apiBaseUrl.replace(/\/$/u, '');

export const authApi = {
  login: `${apiBaseUrl}/v1/auth/login`,
  logout: `${apiBaseUrl}/v1/auth/logout`,
  me: `${apiBaseUrl}/v1/auth/me`,
} as const;

export function isApplicationApiUrl(url: string): boolean {
  return url === apiBaseUrl || url.startsWith(`${apiBaseUrl}/`);
}
