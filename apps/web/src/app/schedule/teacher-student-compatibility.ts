import type { CourseCode, Person, SubjectCode } from '../people/people.models';

export interface TeacherCapabilities {
  courseCodes?: CourseCode[];
  subjectCodes?: SubjectCode[];
}

export function teacherCompatibleWithStudent(
  teacher: TeacherCapabilities,
  student: Pick<Person, 'courseCode' | 'subjectHours'>,
): boolean {
  const teacherSubjects = new Set(teacher.subjectCodes ?? []);
  return (
    (teacher.courseCodes ?? []).includes(student.courseCode) &&
    student.subjectHours.some((item) => teacherSubjects.has(item.subjectCode))
  );
}
