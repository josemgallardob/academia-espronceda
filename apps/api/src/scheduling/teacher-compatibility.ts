import type {
  ValidationStudent,
  ValidationTeacher,
} from './validation-context';

export function teacherCompatibleWith(
  teacher: Pick<ValidationTeacher, 'courseCodes' | 'subjectCodes'>,
  student: Pick<ValidationStudent, 'courseCode' | 'subjectHours'>,
): boolean {
  const teacherSubjects = new Set(teacher.subjectCodes);
  return (
    teacher.courseCodes.includes(student.courseCode) &&
    student.subjectHours.some((item) => teacherSubjects.has(item.subjectCode))
  );
}
