import type { CourseCode, Person, SubjectCode } from '../people/people.models';
import { teacherCompatibleWithStudent } from './teacher-student-compatibility';

const profesor1 = {
  courseCodes: ['BACH_2', 'BACH_1'] as CourseCode[],
  subjectCodes: [
    'MATHEMATICS',
    'SOCIAL_SCIENCES_MATHEMATICS',
    'PHYSICS',
    'CHEMISTRY',
  ] as SubjectCode[],
};

const profesor2 = {
  courseCodes: ['ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1'] as CourseCode[],
  subjectCodes: [
    'MATHEMATICS',
    'SOCIAL_SCIENCES_MATHEMATICS',
    'PHYSICS',
    'CHEMISTRY',
    'BIOLOGY',
  ] as SubjectCode[],
};

const profesor3 = {
  courseCodes: ['ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1', 'BACH_2'] as CourseCode[],
  subjectCodes: ['SPANISH_LANGUAGE', 'ENGLISH'] as SubjectCode[],
};

describe('teacherCompatibleWithStudent', () => {
  it('allows Profesor 1 for Bach 2 sciences and the Bach 1 exception, not ESO or languages', () => {
    expect(teacherCompatibleWithStudent(profesor1, student('BACH_2', 'PHYSICS'))).toBe(true);
    expect(teacherCompatibleWithStudent(profesor1, student('BACH_1', 'MATHEMATICS'))).toBe(true);
    expect(teacherCompatibleWithStudent(profesor1, student('ESO_3', 'MATHEMATICS'))).toBe(false);
    expect(teacherCompatibleWithStudent(profesor1, student('BACH_2', 'ENGLISH'))).toBe(false);
  });

  it('allows Profesor 2 for ESO and Bach 1 sciences, including Biology, not Bach 2 or languages', () => {
    expect(teacherCompatibleWithStudent(profesor2, student('ESO_1', 'BIOLOGY'))).toBe(true);
    expect(teacherCompatibleWithStudent(profesor2, student('BACH_1', 'CHEMISTRY'))).toBe(true);
    expect(teacherCompatibleWithStudent(profesor2, student('BACH_2', 'MATHEMATICS'))).toBe(false);
    expect(teacherCompatibleWithStudent(profesor2, student('ESO_4', 'SPANISH_LANGUAGE'))).toBe(
      false,
    );
  });

  it('allows Profesor 3 for Language and English in every ordinary course, not science subjects', () => {
    expect(teacherCompatibleWithStudent(profesor3, student('ESO_2', 'ENGLISH'))).toBe(true);
    expect(teacherCompatibleWithStudent(profesor3, student('BACH_2', 'SPANISH_LANGUAGE'))).toBe(
      true,
    );
    expect(teacherCompatibleWithStudent(profesor3, student('BACH_1', 'PHYSICS'))).toBe(false);
  });

  it('treats a student as compatible when the teacher covers at least one of their subjects', () => {
    const mixed = {
      courseCode: 'BACH_1' as const,
      subjectHours: [
        { subjectCode: 'PHYSICS' as const, weeklyHours: 2 },
        { subjectCode: 'ENGLISH' as const, weeklyHours: 1 },
      ],
    };
    expect(teacherCompatibleWithStudent(profesor1, mixed)).toBe(true);
    expect(teacherCompatibleWithStudent(profesor2, mixed)).toBe(true);
    expect(teacherCompatibleWithStudent(profesor3, mixed)).toBe(true);
  });
});

function student(
  courseCode: CourseCode,
  subjectCode: SubjectCode,
): Pick<Person, 'courseCode' | 'subjectHours'> {
  return { courseCode, subjectHours: [{ subjectCode, weeklyHours: 1 }] };
}
