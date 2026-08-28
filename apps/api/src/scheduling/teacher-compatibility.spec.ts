import { teacherCompatibleWith } from './teacher-compatibility';
import {
  generalSciences,
  languages,
  seniorSciences,
} from './schedule-validator.fixtures';

describe('teacherCompatibleWith', () => {
  it('allows Profesor 1 for Bach 2 sciences and the Bach 1 exception, not ESO or languages', () => {
    expect(
      teacherCompatibleWith(seniorSciences, {
        courseCode: 'BACH_2',
        subjectHours: [{ subjectCode: 'PHYSICS', weeklyHours: 2 }],
      }),
    ).toBe(true);
    expect(
      teacherCompatibleWith(seniorSciences, {
        courseCode: 'BACH_1',
        subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 2 }],
      }),
    ).toBe(true);
    expect(
      teacherCompatibleWith(seniorSciences, {
        courseCode: 'ESO_3',
        subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 2 }],
      }),
    ).toBe(false);
    expect(
      teacherCompatibleWith(seniorSciences, {
        courseCode: 'BACH_2',
        subjectHours: [{ subjectCode: 'ENGLISH', weeklyHours: 1 }],
      }),
    ).toBe(false);
  });

  it('allows Profesor 2 for ESO and Bach 1 sciences, including Biology, not Bach 2 or languages', () => {
    expect(
      teacherCompatibleWith(generalSciences, {
        courseCode: 'ESO_1',
        subjectHours: [{ subjectCode: 'BIOLOGY', weeklyHours: 2 }],
      }),
    ).toBe(true);
    expect(
      teacherCompatibleWith(generalSciences, {
        courseCode: 'BACH_1',
        subjectHours: [{ subjectCode: 'CHEMISTRY', weeklyHours: 1 }],
      }),
    ).toBe(true);
    expect(
      teacherCompatibleWith(generalSciences, {
        courseCode: 'BACH_2',
        subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 2 }],
      }),
    ).toBe(false);
    expect(
      teacherCompatibleWith(generalSciences, {
        courseCode: 'ESO_4',
        subjectHours: [{ subjectCode: 'SPANISH_LANGUAGE', weeklyHours: 1 }],
      }),
    ).toBe(false);
  });

  it('allows Profesor 3 for Language and English in every ordinary course, not science subjects', () => {
    expect(
      teacherCompatibleWith(languages, {
        courseCode: 'ESO_2',
        subjectHours: [{ subjectCode: 'ENGLISH', weeklyHours: 1 }],
      }),
    ).toBe(true);
    expect(
      teacherCompatibleWith(languages, {
        courseCode: 'BACH_2',
        subjectHours: [{ subjectCode: 'SPANISH_LANGUAGE', weeklyHours: 2 }],
      }),
    ).toBe(true);
    expect(
      teacherCompatibleWith(languages, {
        courseCode: 'BACH_1',
        subjectHours: [{ subjectCode: 'PHYSICS', weeklyHours: 2 }],
      }),
    ).toBe(false);
  });

  it('treats a student as compatible when the teacher covers at least one of their subjects', () => {
    const mixed = {
      courseCode: 'BACH_1' as const,
      subjectHours: [
        { subjectCode: 'PHYSICS' as const, weeklyHours: 2 },
        { subjectCode: 'ENGLISH' as const, weeklyHours: 1 },
      ],
    };
    expect(teacherCompatibleWith(seniorSciences, mixed)).toBe(true);
    expect(teacherCompatibleWith(generalSciences, mixed)).toBe(true);
    expect(teacherCompatibleWith(languages, mixed)).toBe(true);
  });
});
