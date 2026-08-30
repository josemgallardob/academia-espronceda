import { expect, test } from '@playwright/test';
import { loginAsDemoAdmin, resetOperationalData } from '../support/auth';
import { createScienceStudents } from '../support/people';
import {
  confirmCurrentSchedule,
  SENIOR_SCIENCES_TEACHER,
  generateSchedule,
  openSchedule,
  selectTeacher,
} from '../support/schedule';

test.beforeEach(async ({ request }) => {
  await resetOperationalData(request);
});

test('creates students, generates a valid schedule and confirms it', async ({ page }) => {
  await loginAsDemoAdmin(page);
  const names = await createScienceStudents(page, 4, 'Gen', {
    courseLabel: '2.º Bachillerato',
    onlyMonday1600: true,
  });

  await page.getByRole('link', { name: 'Personas' }).click();
  await expect(page.getByRole('heading', { name: 'Alumnos y lista de espera' })).toBeVisible();
  for (const name of names) {
    await expect(page.getByText(`${name} E2E`)).toBeVisible();
  }

  await openSchedule(page);
  await generateSchedule(page);
  await expect(
    page.getByText('Se ha generado un horario válido. Puedes revisarlo, editarlo y confirmarlo.'),
  ).toBeVisible();
  await expect(page.getByText('Válido', { exact: true })).toBeVisible();

  await selectTeacher(page, SENIOR_SCIENCES_TEACHER);
  await expect(page.getByRole('grid', { name: 'Cuadrante semanal del profesor' })).toBeVisible();
  for (const name of names) {
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  }

  await confirmCurrentSchedule(page);
});
