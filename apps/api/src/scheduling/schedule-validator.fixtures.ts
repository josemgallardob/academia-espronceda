import { addAssignment, createEmptyDraft } from './schedule-aggregate';
import type {
  NewIdentity,
  Schedule,
  ScheduleSlot,
  ScheduleTeacher,
  SubjectTeacherAllocation,
} from './schedule';
import type {
  ValidationContext,
  ValidationStudent,
  ValidationTeacher,
} from './validation-context';

export const monday1600: ScheduleSlot = {
  id: 'slot-monday-1600',
  dayOfWeek: 'MONDAY',
  startTime: '16:00',
  endTime: '17:00',
};
export const monday1700: ScheduleSlot = {
  id: 'slot-monday-1700',
  dayOfWeek: 'MONDAY',
  startTime: '17:00',
  endTime: '18:00',
};
export const monday1900: ScheduleSlot = {
  id: 'slot-monday-1900',
  dayOfWeek: 'MONDAY',
  startTime: '19:00',
  endTime: '20:00',
};
export const tuesday1600: ScheduleSlot = {
  id: 'slot-tuesday-1600',
  dayOfWeek: 'TUESDAY',
  startTime: '16:00',
  endTime: '17:00',
};

export const defaultSlots: ScheduleSlot[] = [
  monday1600,
  monday1700,
  tuesday1600,
];

export const generalSciences: ValidationTeacher = {
  id: 'teacher-general',
  displayName: 'Profesor General',
  profile: 'GENERAL_SCIENCES',
  subjectCodes: [
    'MATHEMATICS',
    'SOCIAL_SCIENCES_MATHEMATICS',
    'PHYSICS',
    'CHEMISTRY',
    'BIOLOGY',
  ],
  courseCodes: ['ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1'],
  availableSlotIds: defaultSlots.map((slot) => slot.id),
};

export const seniorSciences: ValidationTeacher = {
  id: 'teacher-senior',
  displayName: 'Profesor Senior',
  profile: 'SENIOR_SCIENCES',
  subjectCodes: [
    'MATHEMATICS',
    'SOCIAL_SCIENCES_MATHEMATICS',
    'PHYSICS',
    'CHEMISTRY',
  ],
  courseCodes: ['BACH_1', 'BACH_2', 'OTHER'],
  availableSlotIds: defaultSlots.map((slot) => slot.id),
};

export const languages: ValidationTeacher = {
  id: 'teacher-languages',
  displayName: 'Profesor Lenguas',
  profile: 'LANGUAGES',
  subjectCodes: ['SPANISH_LANGUAGE', 'ENGLISH'],
  courseCodes: [
    'ESO_1',
    'ESO_2',
    'ESO_3',
    'ESO_4',
    'BACH_1',
    'BACH_2',
    'OTHER',
  ],
  availableSlotIds: defaultSlots.map((slot) => slot.id),
};

export function snapshotTeachers(
  teachers: ValidationTeacher[] = [generalSciences, languages],
): ScheduleTeacher[] {
  return teachers.map((teacher) => ({
    id: teacher.id,
    displayName: teacher.displayName,
    profile: teacher.profile,
  }));
}

export function emptySchedule(
  teachers: ValidationTeacher[] = [generalSciences, languages],
  slots: ScheduleSlot[] = defaultSlots,
): Schedule {
  return createEmptyDraft({
    id: 'schedule-1',
    createdAt: '2026-08-27T10:00:00.000Z',
    teachers: snapshotTeachers(teachers),
    slots,
  });
}

export function student(
  overrides: Partial<ValidationStudent> & { id: string },
): ValidationStudent {
  return {
    displayName: overrides.displayName ?? `Alumno ${overrides.id}`,
    status: 'ACTIVE',
    courseCode: 'BACH_1',
    subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 1 }],
    weeklyHoursTotal: 1,
    unavailableSlotIds: [],
    relatedPersonIds: [],
    ...overrides,
  };
}

export function context(input: {
  students: ValidationStudent[];
  teachers?: ValidationTeacher[];
}): ValidationContext {
  return {
    students: input.students,
    teachers: input.teachers ?? [generalSciences, languages],
  };
}

export function identity(suffix: string): NewIdentity {
  return {
    assignmentId: `assignment-${suffix}`,
    classId: `class-${suffix}`,
    updatedAt: '2026-08-27T10:01:00.000Z',
  };
}

export function assign(
  schedule: Schedule,
  input: {
    student: ValidationStudent;
    teacherId: string;
    slotId: string;
    suffix: string;
  },
): Schedule {
  return addAssignment(
    schedule,
    {
      expectedRevision: schedule.revision,
      studentId: input.student.id,
      studentDisplayName: input.student.displayName,
      studentStatus: input.student.status,
      weeklyHoursTotal: 99,
      teacherId: input.teacherId,
      slotId: input.slotId,
    },
    identity(input.suffix),
  );
}

export function withClass(
  schedule: Schedule,
  input: {
    id: string;
    teacherId: string;
    slotId: string;
    studentIds: Array<{ id: string; name: string; assignmentId?: string }>;
  },
): Schedule {
  return {
    ...schedule,
    classes: [
      ...schedule.classes,
      {
        id: input.id,
        teacherId: input.teacherId,
        slotId: input.slotId,
        findingFingerprints: [],
        assignments: input.studentIds.map((item, index) => ({
          id: item.assignmentId ?? `${input.id}-a${index + 1}`,
          studentId: item.id,
          studentDisplayName: item.name,
        })),
      },
    ],
  };
}

export function withAllocations(
  schedule: Schedule,
  allocations: SubjectTeacherAllocation[],
): Schedule {
  return { ...schedule, subjectTeacherAllocations: allocations };
}
