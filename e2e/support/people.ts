import { expect, type Page } from '@playwright/test';

export interface NewStudentInput {
  firstName: string;
  firstSurname: string;
  phone: string;
  courseLabel?: string;
  subjectLabel?: string;
  weeklyHours?: number;
  onlyMonday1600?: boolean;
}

export async function createActiveStudent(page: Page, input: NewStudentInput): Promise<void> {
  const courseLabel = input.courseLabel ?? '1.º Bachillerato';
  const subjectLabel = input.subjectLabel ?? 'Matemáticas';
  const weeklyHours = input.weeklyHours ?? 1;

  await page.getByRole('link', { name: 'Personas' }).click();
  await page.getByRole('link', { name: 'Nueva persona' }).click();
  await expect(page.getByRole('heading', { name: 'Nueva persona' })).toBeVisible();

  await page.getByLabel('Alumno activo').check();
  await page.locator('input[formcontrolname="firstName"]').fill(input.firstName);
  await page.locator('input[formcontrolname="firstSurname"]').fill(input.firstSurname);
  await page.locator('input[formcontrolname="primaryPhone"]').fill(input.phone);
  await page.locator('select[formcontrolname="courseCode"]').selectOption({
    label: courseLabel,
  });

  const subjectCheckbox = page.getByRole('checkbox', { name: subjectLabel, exact: true });
  await subjectCheckbox.check();
  const subjectRow = page.locator('.subject-row').filter({ has: subjectCheckbox });
  await subjectRow.locator('input[type="number"]').fill(String(weeklyHours));
  await page.locator('input[formcontrolname="weeklyHoursTotal"]').fill(String(weeklyHours));
  if (input.onlyMonday1600) {
    await markUnavailableExceptMonday1600(page);
  }

  const notTutored = page.getByRole('radio', { name: 'No', exact: true });
  await notTutored.click();
  await expect(notTutored).toBeChecked();

  await page.getByRole('button', { name: 'Crear persona' }).click();
  await expect(
    page.getByRole('heading', {
      name: new RegExp(`${input.firstName} ${input.firstSurname}`),
    }),
  ).toBeVisible();
}

export async function createScienceStudents(
  page: Page,
  count: number,
  prefix: string,
  options: Pick<NewStudentInput, 'courseLabel' | 'onlyMonday1600'> = {},
): Promise<string[]> {
  const names: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    const firstName = `${prefix}${index}`;
    names.push(firstName);
    await createActiveStudent(page, {
      firstName,
      firstSurname: 'E2E',
      phone: `600${String(100000 + index).slice(-6)}`,
      ...options,
    });
  }
  return names;
}

async function markUnavailableExceptMonday1600(page: Page): Promise<void> {
  const daySections = page.locator('.availability-grid > section');
  const dayCount = await daySections.count();
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    const section = daySections.nth(dayIndex);
    const dayName = (await section.locator('h3').innerText()).trim();
    const boxes = section.getByRole('checkbox');
    const boxCount = await boxes.count();
    for (let boxIndex = 0; boxIndex < boxCount; boxIndex += 1) {
      const box = boxes.nth(boxIndex);
      const slotLabel = ((await box.locator('xpath=..').innerText()) ?? '').trim();
      const keepAvailable = dayName === 'Lunes' && slotLabel.startsWith('16:00');
      if (!keepAvailable) {
        await box.check();
      }
    }
  }
}
