import type { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  apiBaseUrl: '/api',
  localDemo: {
    identifier: 'profesor1',
    password: 'local-only-admin-password-1',
  },
};
