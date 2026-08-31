import { expect, test } from '@playwright/test';
import { loginAsDemoAdmin, resetOperationalData } from '../support/auth';
import { createScienceStudents } from '../support/people';
import {
  createEmptyDraft,
  dragStudentToMonday,
  GENERAL_SCIENCES_TEACHER,
  LANGUAGES_TEACHER,
  mondaySlot,
  openSchedule,
  openWarnings,
  selectTeacher,
  SENIOR_SCIENCES_TEACHER,
} from '../support/schedule';

test.beforeEach(async ({ request }) => {
  await resetOperationalData(request);
});

test('keeps the global weekly schedule when changing teacher', async ({ page }) => {
  await loginAsDemoAdmin(page);
  const [name] = await createScienceStudents(page, 1, 'Nav');

  await openSchedule(page);
  await createEmptyDraft(page);
  await selectTeacher(page, GENERAL_SCIENCES_TEACHER);
  await dragStudentToMonday(page, name);
  await expect(mondaySlot(page).getByRole('link', { name: new RegExp(name) })).toBeVisible();

  await selectTeacher(page, SENIOR_SCIENCES_TEACHER);
  await expect(page.getByRole('columnheader', { name: 'Lunes' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Viernes' })).toBeVisible();

  await selectTeacher(page, LANGUAGES_TEACHER);
  await expect(page.getByText('No hay alumnos compatibles con este profesor.')).toBeVisible();

  await openWarnings(page);
  await expect(
    page.getByRole('heading', { name: 'Avisos del horario semanal global' }),
  ).toBeVisible();
  await expect(page.getByText(/mínimo recomendado/)).toBeVisible();

  await page.getByRole('tab', { name: 'Cuadrante' }).click();
  await selectTeacher(page, GENERAL_SCIENCES_TEACHER);
  await expect(mondaySlot(page).getByRole('link', { name: new RegExp(name) })).toBeVisible();
});
