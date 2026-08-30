import { expect, test } from '@playwright/test';
import { loginAsDemoAdmin, resetOperationalData } from '../support/auth';
import { createScienceStudents } from '../support/people';
import { generateSchedule, openSchedule, openWarnings } from '../support/schedule';

test.beforeEach(async ({ request }) => {
  await resetOperationalData(request);
});

test('reviews an approximate generated schedule and confirms its incidences', async ({ page }) => {
  await loginAsDemoAdmin(page);
  await createScienceStudents(page, 2, 'Aprox', { onlyMonday1600: true });

  await openSchedule(page);
  await generateSchedule(page);
  await expect(page.getByText(/El horario generado es aproximado/)).toBeVisible();
  await expect(page.getByText('Aproximado', { exact: true })).toBeVisible();

  await openWarnings(page);
  await expect(page.getByText('Incidencia')).toHaveCount(2);
  await expect(page.getByText(/mínimo recomendado/).first()).toBeVisible();

  await page.getByRole('button', { name: /Confirmar horario/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Confirmar horario con incidencias' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(
    page.getByText('Horario confirmado con incidencias bajo tu responsabilidad.'),
  ).toBeVisible();
});
