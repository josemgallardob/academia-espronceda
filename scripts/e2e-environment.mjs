import { resolve } from 'node:path';
import { loadLocalEnvironment, prepareLocalDatabase } from './local-environment.mjs';

export const E2E_WEB_HOST = '127.0.0.1';
export const E2E_WEB_PORT = '4277';
export const E2E_API_PORT = '3077';
export const E2E_SOLVER_PORT = '8077';
export const E2E_ORIGIN = `http://${E2E_WEB_HOST}:${E2E_WEB_PORT}`;
export const E2E_DATABASE_URL = 'file:./.data/e2e.db';
export const E2E_DATABASE_PATH = resolve('.data/e2e.db');
export const E2E_RESET_TOKEN = 'local-only-e2e-reset-token'; // keep in sync with e2e/support/constants.ts

export function loadE2eEnvironment() {
  const local = loadLocalEnvironment();
  const environment = {
    ...local,
    WEB_HOST: E2E_WEB_HOST,
    WEB_PORT: E2E_WEB_PORT,
    API_HOST: '127.0.0.1',
    API_PORT: E2E_API_PORT,
    API_CORS_ORIGINS: `${E2E_ORIGIN},http://localhost:${E2E_WEB_PORT}`,
    SOLVER_HOST: '127.0.0.1',
    SOLVER_PORT: E2E_SOLVER_PORT,
    SOLVER_URL: `http://127.0.0.1:${E2E_SOLVER_PORT}`,
    DATABASE_URL: E2E_DATABASE_URL,
    API_PROXY_TARGET: `http://127.0.0.1:${E2E_API_PORT}`,
    TEACHER_1_DISPLAY_NAME: 'Profesor 1',
    TEACHER_2_DISPLAY_NAME: 'Profesor 2',
    TEACHER_3_DISPLAY_NAME: 'Profesor 3',
    AUTH_LOGIN_IDENTIFIER_LIMIT: '100',
    AUTH_LOGIN_IP_LIMIT: '100',
    E2E_RESET_TOKEN,
  };
  prepareLocalDatabase(environment);
  return environment;
}
