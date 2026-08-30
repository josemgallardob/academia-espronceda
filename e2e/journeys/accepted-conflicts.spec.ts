import { expect, test } from '@playwright/test';
import { loginAsDemoAdmin, resetOperationalData } from '../support/auth';
import { createScienceStudents } from '../support/people';
import {
  confirmCurrentSchedule,
  createEmptyDraft,
  dragStudentToMonday,
  GENERAL_SCIENCES_TEACHER,
  openSchedule,
  openWarnings,
  selectTeacher,
} from '../support/schedule';

test.beforeEach(async ({ request }) => {
  await resetOperationalData(request);
});

test('keeps a relaxable class-size conflict and confirms with accepted incidences', async ({
  page,
}) => {
  await loginAsDemoAdmin(page);
  const names = await createScienceStudents(page, 2, 'Inc');

  await openSchedule(page);
  await createEmptyDraft(page);
  await selectTeacher(page, GENERAL_SCIENCES_TEACHER);
  for (const name of names) {
    await dragStudentToMonday(page, name);
  }

  await openWarnings(page);
  await expect(page.getByText('Incidencia')).toBeVisible();
  await expect(page.getByText(/mínimo recomendado/)).toBeVisible();

  await page.getByRole('button', { name: /Confirmar horario/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Confirmar horario con incidencias' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(
    page.getByText('Horario confirmado con incidencias bajo tu responsabilidad.'),
  ).toBeVisible();
  await expect(page.getByText('Confirmado', { exact: true })).toBeVisible();
});
