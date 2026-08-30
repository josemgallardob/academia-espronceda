import type { DayOfWeek, Person, SubjectCode } from '../people/people.models';
import type { Schedule, TeacherOption } from './schedule.models';
import { WEEK_DAYS } from './schedule.models';

export interface StudentConfirmedSlot {
  slotId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  teacherId: string;
  teacherDisplayName: string;
  subjectCodes: SubjectCode[];
}

export function studentConfirmedSlots(
  schedule: Schedule,
  student: Pick<Person, 'id' | 'subjectHours'>,
  teachers: TeacherOption[] = [],
): StudentConfirmedSlot[] {
  const slotsById = new Map(schedule.slots.map((slot) => [slot.id, slot]));
  const teachersById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
  const scheduleTeachersById = new Map(schedule.teachers.map((teacher) => [teacher.id, teacher]));

  return schedule.classes
    .filter((weeklyClass) =>
      weeklyClass.assignments.some((assignment) => assignment.studentId === student.id),
    )
    .flatMap((weeklyClass) => {
      const slot = slotsById.get(weeklyClass.slotId);
      if (!slot) {
        return [];
      }
      const teacher =
        scheduleTeachersById.get(weeklyClass.teacherId) ?? teachersById.get(weeklyClass.teacherId);
      return [
        {
          slotId: slot.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          teacherId: weeklyClass.teacherId,
          teacherDisplayName: teacher?.displayName ?? 'Profesor',
          subjectCodes: subjectsForClass(schedule, student, weeklyClass.teacherId, teachers),
        },
      ];
    })
    .sort((left, right) => {
      const dayOrder = WEEK_DAYS.indexOf(left.dayOfWeek) - WEEK_DAYS.indexOf(right.dayOfWeek);
      if (dayOrder !== 0) {
        return dayOrder;
      }
      return left.startTime.localeCompare(right.startTime);
    });
}

function subjectsForClass(
  schedule: Schedule,
  student: Pick<Person, 'id' | 'subjectHours'>,
  teacherId: string,
  teachers: TeacherOption[],
): SubjectCode[] {
  const allocation = schedule.subjectTeacherAllocations.find(
    (item) => item.studentId === student.id && item.teacherId === teacherId,
  );
  if (allocation && allocation.subjectHours.length > 0) {
    return allocation.subjectHours.map((item) => item.subjectCode);
  }

  const studentSubjects = student.subjectHours.map((item) => item.subjectCode);
  const teacherSubjects = teachers.find((teacher) => teacher.id === teacherId)?.subjectCodes;
  if (teacherSubjects && teacherSubjects.length > 0) {
    const supported = new Set(teacherSubjects);
    const matched = studentSubjects.filter((code) => supported.has(code));
    if (matched.length > 0) {
      return matched;
    }
  }

  return studentSubjects;
}
