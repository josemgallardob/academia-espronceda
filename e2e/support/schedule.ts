import { expect, type Locator, type Page } from '@playwright/test';

export const GENERAL_SCIENCES_TEACHER = 'Profesor 2';
export const SENIOR_SCIENCES_TEACHER = 'Profesor 1';
export const LANGUAGES_TEACHER = 'Profesor 3';

export async function openSchedule(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Horario' }).click();
  await expect(page.getByRole('heading', { name: 'Cuadrante semanal' })).toBeVisible();
}

export async function selectTeacher(page: Page, displayName: string): Promise<void> {
  await page.locator('section[aria-label="Filtro de cuadrante"] select').selectOption({
    label: displayName,
  });
}

export async function createEmptyDraft(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Crear borrador vacío' }).click();
  await expect(page.getByRole('grid', { name: 'Cuadrante semanal del profesor' })).toBeVisible();
}

export async function generateSchedule(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Generar horario' }).first().click();
  await expect(page.getByText('Generando el horario semanal…')).toBeHidden({
    timeout: 60_000,
  });
}

export function mondaySlot(page: Page): Locator {
  return page.getByRole('article', { name: /Lunes, 16:00/ });
}

export async function dragStudentToMonday(page: Page, firstName: string): Promise<void> {
  const student = page.locator('.roster li', { hasText: firstName });
  const slot = mondaySlot(page);
  await student.scrollIntoViewIfNeeded();
  await slot.scrollIntoViewIfNeeded();
  await student.dispatchEvent('dragstart');
  await slot.dispatchEvent('dragover');
  await slot.dispatchEvent('drop');
  await expect(slot.getByRole('link', { name: new RegExp(firstName) })).toBeVisible();
}

export async function confirmCurrentSchedule(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Confirmar horario/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByText(/Horario confirmado/)).toBeVisible();
  await expect(page.getByText('Confirmado', { exact: true })).toBeVisible();
}

export async function openWarnings(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /Avisos/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Avisos del horario semanal global' }),
  ).toBeVisible();
}
