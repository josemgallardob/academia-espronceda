import { expect, test } from '@playwright/test';
import { E2E_USER, loginAsDemoAdmin, resetOperationalData } from '../support/auth';

test.beforeEach(async ({ request }) => {
  await resetOperationalData(request);
});

test('rejects invalid credentials and then opens the workspace', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

  await page.locator('#identifier').fill(E2E_USER.identifier);
  await page.locator('#password').fill('wrong-password-for-e2e');
  await page.getByRole('button', { name: 'Acceder' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'El usuario/email o la contraseña no son correctos.',
  );

  await loginAsDemoAdmin(page);
  await expect(page.getByRole('link', { name: 'Personas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Horario' })).toBeVisible();
});
