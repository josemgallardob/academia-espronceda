import { CURRENT_RULE_CATALOG_VERSION, type ScheduleSlot } from './schedule';
import { generationInfeasible } from './solver-errors';
import {
  DEFAULT_SOLVE_TIME_LIMIT_SECONDS,
  SOLVER_CONTRACT_VERSION,
  SOLVER_TIMEZONE,
  type SolveScheduleRequest,
} from './solver-contract';
import type {
  ValidationStudent,
  ValidationTeacher,
} from './validation-context';

export function seedFromRequestId(requestId: string): number {
  let hash = 2166136261;
  for (const character of requestId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function toSolveScheduleRequest(input: {
  requestId: string;
  slots: ScheduleSlot[];
  teachers: ValidationTeacher[];
  students: ValidationStudent[];
  timeLimitSeconds?: number;
  randomSeed?: number;
}): SolveScheduleRequest {
  const slotIds = new Set(input.slots.map((slot) => slot.id));
  const teachers = input.teachers.flatMap((teacher) => {
    const availableSlotIds = uniqueSorted(
      teacher.availableSlotIds.filter((slotId) => slotIds.has(slotId)),
    );
    const supportedCourseCodes = uniqueSorted(teacher.courseCodes);
    const supportedSubjectCodes = uniqueSorted(teacher.subjectCodes);
    if (
      availableSlotIds.length === 0 ||
      supportedCourseCodes.length === 0 ||
      supportedSubjectCodes.length === 0
    ) {
      return [];
    }
    return [
      {
        id: teacher.id,
        profile: teacher.profile,
        supportedCourseCodes,
        supportedSubjectCodes,
        availableSlotIds,
      },
    ];
  });
  if (input.slots.length === 0 || teachers.length === 0) {
    throw generationInfeasible(
      'No hay profesores o franjas suficientes para generar un horario.',
    );
  }

  const students = input.students
    .filter((student) => student.status === 'ACTIVE')
    .map((student) => {
      if (student.subjectHours.length === 0 || student.weeklyHoursTotal < 1) {
        throw generationInfeasible(
          `El alumno ${student.id} no tiene horas contratadas válidas.`,
        );
      }
      return {
        id: student.id,
        status: 'ACTIVE' as const,
        courseCode: student.courseCode,
        subjectHours: student.subjectHours.map((item) => ({
          subjectCode: item.subjectCode,
          weeklyHours: item.weeklyHours,
        })),
        weeklyHoursTotal: student.weeklyHoursTotal,
        unavailableSlotIds: uniqueSorted(
          student.unavailableSlotIds.filter((slotId) => slotIds.has(slotId)),
        ),
      };
    });
  const studentIds = new Set(students.map((student) => student.id));

  return {
    contractVersion: SOLVER_CONTRACT_VERSION,
    ruleCatalogVersion: CURRENT_RULE_CATALOG_VERSION,
    requestId: input.requestId,
    timezone: SOLVER_TIMEZONE,
    slots: input.slots.map((slot) => ({
      id: slot.id,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
    })),
    teachers,
    students,
    relationships: relatedPairs(input.students, studentIds),
    options: {
      timeLimitSeconds:
        input.timeLimitSeconds ?? DEFAULT_SOLVE_TIME_LIMIT_SECONDS,
      randomSeed: input.randomSeed ?? seedFromRequestId(input.requestId),
    },
  };
}

function relatedPairs(
  students: ValidationStudent[],
  studentIds: Set<string>,
): Array<{ studentIds: [string, string] }> {
  const seen = new Set<string>();
  const pairs: Array<{ studentIds: [string, string] }> = [];
  for (const student of students) {
    if (!studentIds.has(student.id)) {
      continue;
    }
    for (const relatedId of student.relatedPersonIds) {
      if (!studentIds.has(relatedId) || relatedId === student.id) {
        continue;
      }
      const pair = [student.id, relatedId].sort() as [string, string];
      const key = `${pair[0]}:${pair[1]}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      pairs.push({ studentIds: pair });
    }
  }
  return pairs;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}
