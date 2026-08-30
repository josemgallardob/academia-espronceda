import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_ORIGIN, E2E_RESET_TOKEN } from './constants';

export const E2E_USER = {
  identifier: 'profesor1',
  password: 'local-only-admin-password-1',
} as const;

export async function loginAsDemoAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Entrar y abrir Horario' }).click();
  await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
}

export async function resetOperationalData(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/v1/e2e/operational-data/reset', {
    headers: {
      Origin: E2E_ORIGIN,
      'X-E2E-RESET-TOKEN': process.env.E2E_RESET_TOKEN ?? E2E_RESET_TOKEN,
    },
  });
  if (!response.ok()) {
    throw new Error(`Failed to reset e2e operational data: ${response.status()}`);
  }
}
