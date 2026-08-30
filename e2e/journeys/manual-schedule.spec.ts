import { expect, test } from '@playwright/test';
import { loginAsDemoAdmin, resetOperationalData } from '../support/auth';
import { createScienceStudents } from '../support/people';
import {
  confirmCurrentSchedule,
  createEmptyDraft,
  dragStudentToMonday,
  GENERAL_SCIENCES_TEACHER,
  mondaySlot,
  openSchedule,
  selectTeacher,
} from '../support/schedule';

test.beforeEach(async ({ request }) => {
  await resetOperationalData(request);
});

test('creates an empty draft, assigns students by hand and confirms', async ({ page }) => {
  await loginAsDemoAdmin(page);
  const names = await createScienceStudents(page, 4, 'Man');

  await openSchedule(page);
  await createEmptyDraft(page);
  await selectTeacher(page, GENERAL_SCIENCES_TEACHER);

  for (const name of names) {
    await dragStudentToMonday(page, name);
  }

  await expect(mondaySlot(page).getByRole('link')).toHaveCount(4);
  await confirmCurrentSchedule(page);
});

test('removes a student from a class and restores the remaining hour', async ({ page }) => {
  await loginAsDemoAdmin(page);
  const [name] = await createScienceStudents(page, 1, 'Ret');

  await openSchedule(page);
  await createEmptyDraft(page);
  await selectTeacher(page, GENERAL_SCIENCES_TEACHER);
  await dragStudentToMonday(page, name);

  const rosterItem = page.locator('.roster li', { hasText: name });
  await expect(rosterItem.locator('.hours-badge')).toHaveAttribute('data-tone', 'complete');
  await expect(rosterItem.getByText('horas restantes: 0')).toBeAttached();

  await mondaySlot(page)
    .getByRole('button', { name: `Retirar a ${name} E2E` })
    .click();
  await expect(mondaySlot(page).getByRole('link', { name: new RegExp(name) })).toHaveCount(0);
  await expect(rosterItem.locator('.hours-badge')).toHaveAttribute('data-tone', 'remaining');
  await expect(rosterItem.getByText('horas restantes: 1')).toBeAttached();
});
