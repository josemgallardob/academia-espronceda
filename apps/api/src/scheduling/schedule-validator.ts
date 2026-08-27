import { createHash, randomUUID } from 'node:crypto';
import type { CourseCode, SubjectCode } from '../database/schema/catalog';
import {
  CURRENT_RULE_CATALOG_VERSION,
  type EntityReference,
  type EvaluationCounts,
  type EvaluationOutcome,
  type FindingParameterValue,
  type Schedule,
  type ScheduleEvaluation,
  type ScheduleFinding,
  type ScheduleSlot,
  type SubjectTeacherAllocation,
  type WeeklyClass,
} from './schedule';
import { isSixtyMinuteSlot } from './schedule-aggregate';
import {
  RULE_DEFINITIONS,
  SCIENCE_SUBJECT_CODES,
  SCORE_PRIORITY_ORDER,
  type ValidationContext,
  type ValidationPurpose,
  type ValidationStudent,
  type ValidationTeacher,
} from './validation-context';

export interface InternalScore {
  byPriority: Record<number, number>;
  lexicographic: number[];
}

export interface EvaluateScheduleResult {
  evaluation: ScheduleEvaluation;
  internalScore: InternalScore;
}

const DAY_LABELS: Record<ScheduleSlot['dayOfWeek'], string> = {
  MONDAY: 'lunes',
  TUESDAY: 'martes',
  WEDNESDAY: 'miércoles',
  THURSDAY: 'jueves',
  FRIDAY: 'viernes',
};

export function evaluateSchedule(
  schedule: Schedule,
  context: ValidationContext,
  options: {
    purpose: ValidationPurpose;
    evaluatedAt?: string;
    evaluationId?: string;
  },
): EvaluateScheduleResult {
  const students = indexBy(context.students, (student) => student.id);
  const teachers = indexBy(context.teachers, (teacher) => teacher.id);
  const slots = indexBy(schedule.slots, (slot) => slot.id);
  const findings: ScheduleFinding[] = [];
  const score: InternalScore = {
    byPriority: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    lexicographic: [0, 0, 0, 0, 0, 0],
  };

  collectActiveStudentsOnly(schedule, students, findings);
  collectClassSlotValid(schedule, slots, findings);
  collectTeacherSingleClassPerSlot(schedule, findings);
  collectStudentUniqueInClass(schedule, findings);
  collectStudentTimeOverlap(schedule, slots, students, findings);
  collectTeacherSubjectCompatibility(schedule, students, teachers, findings);
  collectTeacherCourseCompatibility(schedule, students, teachers, findings);
  collectTeacherAvailability(schedule, teachers, findings);
  collectStudentAvailability(schedule, students, findings);
  collectWeeklyHours(schedule, students, options.purpose, findings);
  collectSubjectHoursAndSingleTeacher(schedule, students, findings);
  collectClassCapacity(schedule, findings, score);
  collectTeacherContinuity(schedule, students, teachers, findings, score);
  collectRelatedStudents(schedule, students, teachers, slots, findings, score);
  collectPreferredTeachers(schedule, students, teachers, findings, score);

  const ordered = sortFindings(findings);
  const counts = countFindings(ordered);
  const outcome = outcomeFrom(counts);
  const evaluation: ScheduleEvaluation = {
    id: options.evaluationId ?? randomUUID(),
    validationFingerprint: fingerprintOf({
      scheduleId: schedule.id,
      scheduleRevision: schedule.revision,
      ruleCatalogVersion: CURRENT_RULE_CATALOG_VERSION,
      outcome,
      findingFingerprints: ordered.map((finding) => finding.fingerprint),
    }),
    scheduleId: schedule.id,
    scheduleRevision: schedule.revision,
    ruleCatalogVersion: CURRENT_RULE_CATALOG_VERSION,
    evaluatedAt: options.evaluatedAt ?? new Date().toISOString(),
    outcome,
    canConfirm: outcome !== 'BLOCKED',
    counts,
    findings: ordered,
  };
  score.lexicographic = SCORE_PRIORITY_ORDER.map(
    (priority) => score.byPriority[priority] ?? 0,
  );
  return { evaluation, internalScore: score };
}

function collectActiveStudentsOnly(
  schedule: Schedule,
  students: Map<string, ValidationStudent>,
  findings: ScheduleFinding[],
): void {
  for (const weeklyClass of schedule.classes) {
    for (const assignment of weeklyClass.assignments) {
      const student = students.get(assignment.studentId);
      if (student?.status === 'ACTIVE') {
        continue;
      }
      findings.push(
        finding('ACTIVE_STUDENTS_ONLY', {
          entityRefs: [
            { type: 'SCHEDULE', id: schedule.id },
            { type: 'ASSIGNMENT', id: assignment.id },
            { type: 'STUDENT', id: assignment.studentId },
          ],
          slotIds: [weeklyClass.slotId],
          parameters: {
            studentStatus: student?.status ?? 'UNKNOWN',
          },
          message: student
            ? `${student.displayName} está en lista de espera y no puede recibir asignaciones.`
            : `El alumno ${assignment.studentDisplayName} no está activo y no puede recibir asignaciones.`,
        }),
      );
    }
  }
}

function collectClassSlotValid(
  schedule: Schedule,
  slots: Map<string, ScheduleSlot>,
  findings: ScheduleFinding[],
): void {
  for (const weeklyClass of schedule.classes) {
    const slot = slots.get(weeklyClass.slotId);
    if (
      slot &&
      isSixtyMinuteSlot(slot.startTime, slot.endTime) &&
      isWeekday(slot.dayOfWeek)
    ) {
      continue;
    }
    findings.push(
      finding('CLASS_SLOT_VALID', {
        entityRefs: [
          { type: 'SCHEDULE', id: schedule.id },
          { type: 'CLASS', id: weeklyClass.id },
          { type: 'SLOT', id: weeklyClass.slotId },
        ],
        slotIds: [weeklyClass.slotId],
        parameters: {
          dayOfWeek: slot?.dayOfWeek ?? 'UNKNOWN',
          startTime: slot?.startTime ?? '',
          endTime: slot?.endTime ?? '',
        },
        message: `La clase ${classLabel(schedule, weeklyClass)} no usa una franja semanal válida de 60 minutos.`,
      }),
    );
  }
}

function collectTeacherSingleClassPerSlot(
  schedule: Schedule,
  findings: ScheduleFinding[],
): void {
  const groups = new Map<string, WeeklyClass[]>();
  for (const weeklyClass of schedule.classes) {
    const key = `${weeklyClass.teacherId}:${weeklyClass.slotId}`;
    const current = groups.get(key) ?? [];
    current.push(weeklyClass);
    groups.set(key, current);
  }
  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }
    const teacher = teacherLabel(schedule, group[0].teacherId);
    findings.push(
      finding('TEACHER_SINGLE_CLASS_PER_SLOT', {
        entityRefs: [
          { type: 'SCHEDULE', id: schedule.id },
          { type: 'TEACHER', id: group[0].teacherId },
          ...group.map((weeklyClass) => ({
            type: 'CLASS' as const,
            id: weeklyClass.id,
          })),
        ],
        slotIds: [group[0].slotId],
        parameters: {
          classIds: group.map((weeklyClass) => weeklyClass.id),
        },
        message: `${teacher} tiene más de una clase en la franja ${slotLabel(schedule, group[0].slotId)}.`,
      }),
    );
  }
}

function collectStudentUniqueInClass(
  schedule: Schedule,
  findings: ScheduleFinding[],
): void {
  for (const weeklyClass of schedule.classes) {
    const byStudent = new Map<string, string[]>();
    for (const assignment of weeklyClass.assignments) {
      const current = byStudent.get(assignment.studentId) ?? [];
      current.push(assignment.id);
      byStudent.set(assignment.studentId, current);
    }
    for (const [studentId, assignmentIds] of byStudent) {
      if (assignmentIds.length < 2) {
        continue;
      }
      findings.push(
        finding('STUDENT_UNIQUE_IN_CLASS', {
          entityRefs: [
            { type: 'CLASS', id: weeklyClass.id },
            { type: 'STUDENT', id: studentId },
            ...assignmentIds.map((id) => ({
              type: 'ASSIGNMENT' as const,
              id,
            })),
          ],
          slotIds: [weeklyClass.slotId],
          parameters: { assignmentIds },
          message: `${studentLabel(schedule, studentId)} aparece más de una vez en la misma clase.`,
        }),
      );
    }
  }
}

function collectStudentTimeOverlap(
  schedule: Schedule,
  slots: Map<string, ScheduleSlot>,
  students: Map<string, ValidationStudent>,
  findings: ScheduleFinding[],
): void {
  const byStudent = studentClasses(schedule);
  for (const [studentId, classes] of byStudent) {
    for (let i = 0; i < classes.length; i += 1) {
      for (let j = i + 1; j < classes.length; j += 1) {
        const left = classes[i];
        const right = classes[j];
        const leftSlot = slots.get(left.slotId);
        const rightSlot = slots.get(right.slotId);
        if (!leftSlot || !rightSlot || !intervalsOverlap(leftSlot, rightSlot)) {
          continue;
        }
        findings.push(
          finding('STUDENT_TIME_OVERLAP', {
            entityRefs: [
              { type: 'SCHEDULE', id: schedule.id },
              { type: 'STUDENT', id: studentId },
              { type: 'CLASS', id: left.id },
              { type: 'CLASS', id: right.id },
              { type: 'TEACHER', id: left.teacherId },
              { type: 'TEACHER', id: right.teacherId },
            ],
            slotIds: uniqueSorted([left.slotId, right.slotId]),
            parameters: {
              classIds: [left.id, right.id],
              teacherIds: [left.teacherId, right.teacherId],
            },
            message: `El alumno ${studentName(schedule, students, studentId)} tiene clases solapadas ${slotLabel(schedule, left.slotId)}${
              left.slotId === right.slotId
                ? ''
                : ` y ${slotLabel(schedule, right.slotId)}`
            }.`,
          }),
        );
      }
    }
  }
}

function collectTeacherSubjectCompatibility(
  schedule: Schedule,
  students: Map<string, ValidationStudent>,
  teachers: Map<string, ValidationTeacher>,
  findings: ScheduleFinding[],
): void {
  for (const weeklyClass of schedule.classes) {
    const teacher = teachers.get(weeklyClass.teacherId);
    const teacherSubjects = new Set(teacher?.subjectCodes ?? []);
    for (const assignment of weeklyClass.assignments) {
      const student = students.get(assignment.studentId);
      const studentSubjects =
        student?.subjectHours.map((item) => item.subjectCode) ?? [];
      const allocated = allocatedSubjectsFor(
        schedule,
        assignment.studentId,
        weeklyClass.teacherId,
      );
      const sharesSubject = studentSubjects.some((code) =>
        teacherSubjects.has(code),
      );
      const unsupportedAllocated = allocated.filter(
        (code) => !teacherSubjects.has(code),
      );
      if (sharesSubject && unsupportedAllocated.length === 0) {
        continue;
      }
      findings.push(
        finding('TEACHER_SUBJECT_COMPATIBILITY', {
          entityRefs: [
            { type: 'ASSIGNMENT', id: assignment.id },
            { type: 'STUDENT', id: assignment.studentId },
            { type: 'TEACHER', id: weeklyClass.teacherId },
          ],
          slotIds: [weeklyClass.slotId],
          parameters: {
            studentSubjectCodes: studentSubjects,
            teacherSubjectCodes: [...teacherSubjects],
          },
          message: `${teacherLabel(schedule, weeklyClass.teacherId)} no cubre las asignaturas de ${studentName(schedule, students, assignment.studentId)}.`,
        }),
      );
    }
  }
}

function collectTeacherCourseCompatibility(
  schedule: Schedule,
  students: Map<string, ValidationStudent>,
  teachers: Map<string, ValidationTeacher>,
  findings: ScheduleFinding[],
): void {
  for (const weeklyClass of schedule.classes) {
    const teacher = teachers.get(weeklyClass.teacherId);
    const teacherCourses = new Set(teacher?.courseCodes ?? []);
    for (const assignment of weeklyClass.assignments) {
      const student = students.get(assignment.studentId);
      const courseCode = student?.courseCode;
      if (courseCode && teacherCourses.has(courseCode)) {
        continue;
      }
      findings.push(
        finding('TEACHER_COURSE_COMPATIBILITY', {
          entityRefs: [
            { type: 'ASSIGNMENT', id: assignment.id },
            { type: 'STUDENT', id: assignment.studentId },
            { type: 'TEACHER', id: weeklyClass.teacherId },
          ],
          slotIds: [weeklyClass.slotId],
          parameters: {
            studentCourseCode: courseCode ?? 'UNKNOWN',
            teacherCourseCodes: [...teacherCourses],
          },
          message: `${teacherLabel(schedule, weeklyClass.teacherId)} no admite el curso de ${studentName(schedule, students, assignment.studentId)}.`,
        }),
      );
    }
  }
}

function collectTeacherAvailability(
  schedule: Schedule,
  teachers: Map<string, ValidationTeacher>,
  findings: ScheduleFinding[],
): void {
  for (const weeklyClass of schedule.classes) {
    const teacher = teachers.get(weeklyClass.teacherId);
    const available = new Set(teacher?.availableSlotIds ?? []);
    if (available.has(weeklyClass.slotId)) {
      continue;
    }
    findings.push(
      finding('TEACHER_AVAILABILITY', {
        entityRefs: [
          { type: 'CLASS', id: weeklyClass.id },
          { type: 'TEACHER', id: weeklyClass.teacherId },
          { type: 'SLOT', id: weeklyClass.slotId },
        ],
        slotIds: [weeklyClass.slotId],
        parameters: {
          teacherAvailableSlotIds: [...available],
        },
        message: `${teacherLabel(schedule, weeklyClass.teacherId)} no está disponible ${slotLabel(schedule, weeklyClass.slotId)}.`,
      }),
    );
  }
}

function collectStudentAvailability(
  schedule: Schedule,
  students: Map<string, ValidationStudent>,
  findings: ScheduleFinding[],
): void {
  for (const weeklyClass of schedule.classes) {
    for (const assignment of weeklyClass.assignments) {
      const student = students.get(assignment.studentId);
      const unavailable = new Set(student?.unavailableSlotIds ?? []);
      if (!unavailable.has(weeklyClass.slotId)) {
        continue;
      }
      findings.push(
        finding('STUDENT_AVAILABILITY', {
          entityRefs: [
            { type: 'CLASS', id: weeklyClass.id },
            { type: 'ASSIGNMENT', id: assignment.id },
            { type: 'STUDENT', id: assignment.studentId },
            { type: 'SLOT', id: weeklyClass.slotId },
          ],
          slotIds: [weeklyClass.slotId],
          parameters: {
            studentUnavailableSlotIds: [...unavailable],
          },
          message: `${studentName(schedule, students, assignment.studentId)} no está disponible ${slotLabel(schedule, weeklyClass.slotId)}.`,
        }),
      );
    }
  }
}

function collectWeeklyHours(
  schedule: Schedule,
  students: Map<string, ValidationStudent>,
  purpose: ValidationPurpose,
  findings: ScheduleFinding[],
): void {
  const relevantStudents = studentsForHourRules(schedule, students);
  for (const student of relevantStudents) {
    const assignedHours = countAssignments(schedule, student.id);
    const remainingHours = student.weeklyHoursTotal - assignedHours;
    const overAssigned = assignedHours > student.weeklyHoursTotal;
    const underAssigned = assignedHours < student.weeklyHoursTotal;
    if (!overAssigned && !(purpose === 'CONFIRMATION' && underAssigned)) {
      continue;
    }
    findings.push(
      finding('STUDENT_WEEKLY_HOURS_EXACT', {
        entityRefs: [
          { type: 'SCHEDULE', id: schedule.id },
          { type: 'STUDENT', id: student.id },
        ],
        slotIds: [],
        parameters: {
          weeklyHoursTotal: student.weeklyHoursTotal,
          assignedHours,
          remainingHours,
        },
        message: overAssigned
          ? `${student.displayName} tiene ${assignedHours} horas asignadas y solo tiene contratadas ${student.weeklyHoursTotal}.`
          : `${student.displayName} tiene ${assignedHours} horas asignadas y debe completar exactamente ${student.weeklyHoursTotal}.`,
      }),
    );
  }
}

function collectSubjectHoursAndSingleTeacher(
  schedule: Schedule,
  students: Map<string, ValidationStudent>,
  findings: ScheduleFinding[],
): void {
  const relevantStudents = studentsForHourRules(schedule, students);
  for (const student of relevantStudents) {
    const teacherIds = teachersForStudent(schedule, student.id);
    const allocations = schedule.subjectTeacherAllocations.filter(
      (allocation) => allocation.studentId === student.id,
    );
    if (teacherIds.length <= 1) {
      continue;
    }

    collectSplitSubjectHours(
      schedule,
      student,
      teacherIds,
      allocations,
      findings,
    );
    collectSubjectSingleTeacher(schedule, student, allocations, findings);
  }
}

function collectSplitSubjectHours(
  schedule: Schedule,
  student: ValidationStudent,
  teacherIds: string[],
  allocations: SubjectTeacherAllocation[],
  findings: ScheduleFinding[],
): void {
  const allocatedBySubject = new Map<SubjectCode, number>();
  const allocatedByTeacher = new Map<string, number>();
  for (const allocation of allocations) {
    allocatedByTeacher.set(
      allocation.teacherId,
      (allocatedByTeacher.get(allocation.teacherId) ?? 0) +
        allocation.totalHours,
    );
    for (const item of allocation.subjectHours) {
      allocatedBySubject.set(
        item.subjectCode,
        (allocatedBySubject.get(item.subjectCode) ?? 0) + item.weeklyHours,
      );
    }
  }

  for (const contracted of student.subjectHours) {
    if (
      allocatedBySubject.get(contracted.subjectCode) === contracted.weeklyHours
    ) {
      continue;
    }
    findings.push(
      finding('STUDENT_SUBJECT_HOURS_EXACT', {
        entityRefs: [
          { type: 'SCHEDULE', id: schedule.id },
          { type: 'STUDENT', id: student.id },
          ...teacherIds.map((id) => ({ type: 'TEACHER' as const, id })),
        ],
        slotIds: [],
        parameters: {
          subjectCode: contracted.subjectCode,
          contractedSubjectHours: contracted.weeklyHours,
          allocatedSubjectHours:
            allocatedBySubject.get(contracted.subjectCode) ?? 0,
          teacherIds,
        },
        message: `El reparto de ${student.displayName} no conserva las ${contracted.weeklyHours} horas contratadas de la asignatura.`,
      }),
    );
  }

  for (const teacherId of teacherIds) {
    const assigned = countAssignmentsWithTeacher(
      schedule,
      student.id,
      teacherId,
    );
    if ((allocatedByTeacher.get(teacherId) ?? 0) === assigned) {
      continue;
    }
    findings.push(
      finding('STUDENT_SUBJECT_HOURS_EXACT', {
        entityRefs: [
          { type: 'SCHEDULE', id: schedule.id },
          { type: 'STUDENT', id: student.id },
          { type: 'TEACHER', id: teacherId },
        ],
        slotIds: [],
        parameters: {
          teacherIds,
          contractedSubjectHours: assigned,
          allocatedSubjectHours: allocatedByTeacher.get(teacherId) ?? 0,
        },
        message: `Las horas de ${student.displayName} con ${teacherLabel(schedule, teacherId)} no coinciden con las clases asignadas.`,
      }),
    );
  }
}

function collectSubjectSingleTeacher(
  schedule: Schedule,
  student: ValidationStudent,
  allocations: SubjectTeacherAllocation[],
  findings: ScheduleFinding[],
): void {
  const teachersBySubject = new Map<SubjectCode, string[]>();
  for (const allocation of allocations) {
    for (const item of allocation.subjectHours) {
      if (item.weeklyHours <= 0) {
        continue;
      }
      const current = teachersBySubject.get(item.subjectCode) ?? [];
      current.push(allocation.teacherId);
      teachersBySubject.set(item.subjectCode, current);
    }
  }
  for (const [subjectCode, teacherIds] of teachersBySubject) {
    const uniqueTeachers = uniqueSorted(teacherIds);
    if (uniqueTeachers.length < 2) {
      continue;
    }
    findings.push(
      finding('SUBJECT_SINGLE_TEACHER', {
        entityRefs: [
          { type: 'SCHEDULE', id: schedule.id },
          { type: 'STUDENT', id: student.id },
          ...uniqueTeachers.map((id) => ({ type: 'TEACHER' as const, id })),
        ],
        slotIds: [],
        parameters: {
          subjectCode,
          teacherIds: uniqueTeachers,
          allocatedSubjectHours: allocations
            .filter((allocation) =>
              uniqueTeachers.includes(allocation.teacherId),
            )
            .flatMap((allocation) =>
              allocation.subjectHours
                .filter((item) => item.subjectCode === subjectCode)
                .map((item) => item.weeklyHours),
            )
            .reduce((total, hours) => total + hours, 0),
        },
        message: `Las horas de una asignatura de ${student.displayName} están repartidas entre varios profesores.`,
      }),
    );
  }
}

function collectClassCapacity(
  schedule: Schedule,
  findings: ScheduleFinding[],
  score: InternalScore,
): void {
  const maximum = RULE_DEFINITIONS.CLASS_CAPACITY_MAXIMUM.maximumCapacity;
  const minimum = RULE_DEFINITIONS.CLASS_CAPACITY_MINIMUM.minimumCapacity;
  const ideal = RULE_DEFINITIONS.CLASS_CAPACITY_IDEAL.idealCapacity;
  for (const weeklyClass of schedule.classes) {
    const actualCapacity = weeklyClass.assignments.length;
    if (actualCapacity === 0) {
      continue;
    }
    const studentIds = weeklyClass.assignments.map(
      (assignment) => assignment.studentId,
    );
    const classRefs: EntityReference[] = [
      { type: 'CLASS', id: weeklyClass.id },
      { type: 'TEACHER', id: weeklyClass.teacherId },
      { type: 'SLOT', id: weeklyClass.slotId },
    ];
    if (actualCapacity > maximum) {
      const excess = actualCapacity - maximum;
      addScore(score, 1, excess);
      findings.push(
        finding('CLASS_CAPACITY_MAXIMUM', {
          entityRefs: classRefs,
          slotIds: [weeklyClass.slotId],
          parameters: {
            studentIds,
            actualCapacity,
            maximumCapacity: maximum,
          },
          message: `La clase ${classLabel(schedule, weeklyClass)} tiene ${actualCapacity} alumnos; el máximo recomendado es ${maximum}.`,
        }),
      );
    }
    if (actualCapacity < minimum) {
      addScore(score, 2, minimum - actualCapacity);
      findings.push(
        finding('CLASS_CAPACITY_MINIMUM', {
          entityRefs: classRefs,
          slotIds: [weeklyClass.slotId],
          parameters: {
            studentIds,
            actualCapacity,
            minimumCapacity: minimum,
          },
          message: `La clase ${classLabel(schedule, weeklyClass)} con ${teacherLabel(schedule, weeklyClass.teacherId)} tiene ${actualCapacity} ${actualCapacity === 1 ? 'alumno' : 'alumnos'}; el mínimo recomendado es ${minimum}.`,
        }),
      );
    }
    if (actualCapacity !== ideal) {
      const penalty =
        actualCapacity < ideal
          ? (ideal - actualCapacity) *
            RULE_DEFINITIONS.CLASS_CAPACITY_IDEAL.belowIdealPenaltyPerStudent
          : (actualCapacity - ideal) *
            RULE_DEFINITIONS.CLASS_CAPACITY_IDEAL.aboveIdealPenaltyPerStudent;
      addScore(score, 3, penalty);
      findings.push(
        finding('CLASS_CAPACITY_IDEAL', {
          entityRefs: [{ type: 'CLASS', id: weeklyClass.id }],
          slotIds: [weeklyClass.slotId],
          parameters: {
            studentIds,
            actualCapacity,
            idealCapacity: ideal,
          },
          message:
            actualCapacity < ideal
              ? `La clase ${classLabel(schedule, weeklyClass)} no alcanza la capacidad ideal de ${ideal} alumnos.`
              : `La clase ${classLabel(schedule, weeklyClass)} supera la capacidad ideal de ${ideal} alumnos.`,
        }),
      );
    }
  }
}

function collectTeacherContinuity(
  schedule: Schedule,
  students: Map<string, ValidationStudent>,
  teachers: Map<string, ValidationTeacher>,
  findings: ScheduleFinding[],
  score: InternalScore,
): void {
  for (const student of students.values()) {
    const assignedTeacherIds = teachersForStudent(schedule, student.id);
    if (assignedTeacherIds.length === 0) {
      continue;
    }
    const subjectCodes = student.subjectHours.map((item) => item.subjectCode);
    const minimumRequiredTeachers = minimumTeachersToCover(subjectCodes, [
      ...teachers.values(),
    ]);
    const extra = assignedTeacherIds.length - minimumRequiredTeachers;
    if (extra <= 0) {
      continue;
    }
    addScore(score, 4, extra);
    findings.push(
      finding('STUDENT_TEACHER_CONTINUITY', {
        entityRefs: [
          { type: 'SCHEDULE', id: schedule.id },
          { type: 'STUDENT', id: student.id },
          ...assignedTeacherIds.map((id) => ({
            type: 'TEACHER' as const,
            id,
          })),
        ],
        slotIds: [],
        parameters: {
          teacherIds: assignedTeacherIds,
          subjectCodes,
          minimumRequiredTeachers,
        },
        message: `${student.displayName} está repartido entre ${assignedTeacherIds.length} profesores y bastaría con ${minimumRequiredTeachers}.`,
      }),
    );
  }
}

function collectRelatedStudents(
  schedule: Schedule,
  students: Map<string, ValidationStudent>,
  teachers: Map<string, ValidationTeacher>,
  slots: Map<string, ScheduleSlot>,
  findings: ScheduleFinding[],
  score: InternalScore,
): void {
  const pairs = relatedPairs(students);
  for (const [leftId, rightId] of pairs) {
    const left = students.get(leftId);
    const right = students.get(rightId);
    if (!left || !right) {
      continue;
    }
    const sharedClassIds = sharedClasses(schedule, leftId, rightId);
    const sharedSessionTarget = feasibleSharedSessions(
      left,
      right,
      [...teachers.values()],
      [...slots.values()],
    );
    const unshared = sharedSessionTarget - sharedClassIds.length;
    if (sharedSessionTarget <= 0 || unshared <= 0) {
      continue;
    }
    addScore(score, 5, unshared);
    findings.push(
      finding('RELATED_STUDENTS_TOGETHER', {
        entityRefs: [
          { type: 'SCHEDULE', id: schedule.id },
          { type: 'STUDENT', id: leftId },
          { type: 'STUDENT', id: rightId },
        ],
        slotIds: [],
        parameters: {
          studentIds: [leftId, rightId],
          sharedClassIds,
          sharedSessionTarget,
        },
        message: `${left.displayName} y ${right.displayName} solo coinciden en ${sharedClassIds.length} ${sharedClassIds.length === 1 ? 'clase' : 'clases'} y podrían compartir ${sharedSessionTarget}.`,
      }),
    );
  }
}

function collectPreferredTeachers(
  schedule: Schedule,
  students: Map<string, ValidationStudent>,
  teachers: Map<string, ValidationTeacher>,
  findings: ScheduleFinding[],
  score: InternalScore,
): void {
  collectPreferredProfile({
    schedule,
    students,
    teachers,
    findings,
    score,
    ruleId: 'PREFERRED_TEACHER_BACH1_SCIENCES',
    courseCode: 'BACH_1',
    preferredProfile: 'GENERAL_SCIENCES',
    fallbackProfile: 'SENIOR_SCIENCES',
    message: (student, teacher) =>
      `${student} de 1.º de Bachillerato está con ${teacher} en ciencias; se prefiere el perfil de ciencias generales.`,
  });
  collectPreferredProfile({
    schedule,
    students,
    teachers,
    findings,
    score,
    ruleId: 'PREFERRED_TEACHER_OTHER_SCIENCES',
    courseCode: 'OTHER',
    preferredProfile: 'SENIOR_SCIENCES',
    fallbackProfile: 'GENERAL_SCIENCES',
    message: (student, teacher) =>
      `${student} del curso Otros está con ${teacher} en ciencias; se prefiere el perfil de ciencias de Bachillerato.`,
  });
}

function collectPreferredProfile(input: {
  schedule: Schedule;
  students: Map<string, ValidationStudent>;
  teachers: Map<string, ValidationTeacher>;
  findings: ScheduleFinding[];
  score: InternalScore;
  ruleId:
    'PREFERRED_TEACHER_BACH1_SCIENCES' | 'PREFERRED_TEACHER_OTHER_SCIENCES';
  courseCode: CourseCode;
  preferredProfile: ValidationTeacher['profile'];
  fallbackProfile: ValidationTeacher['profile'];
  message: (student: string, teacher: string) => string;
}): void {
  const preferredTeachers = [...input.teachers.values()].filter(
    (teacher) => teacher.profile === input.preferredProfile,
  );
  for (const weeklyClass of input.schedule.classes) {
    const assignedTeacher = input.teachers.get(weeklyClass.teacherId);
    if (assignedTeacher?.profile !== input.fallbackProfile) {
      continue;
    }
    for (const assignment of weeklyClass.assignments) {
      const student = input.students.get(assignment.studentId);
      if (
        !student ||
        student.courseCode !== input.courseCode ||
        !hasScienceWorkload(student)
      ) {
        continue;
      }
      const compatiblePreferred = preferredTeachers.some((teacher) =>
        teacherCompatibleWith(teacher, student),
      );
      if (!compatiblePreferred) {
        continue;
      }
      addScore(input.score, 6, 1);
      input.findings.push(
        finding(input.ruleId, {
          entityRefs: [
            { type: 'ASSIGNMENT', id: assignment.id },
            { type: 'STUDENT', id: student.id },
            { type: 'TEACHER', id: weeklyClass.teacherId },
          ],
          slotIds: [weeklyClass.slotId],
          parameters: {
            teacherProfile: assignedTeacher.profile,
            courseCode: student.courseCode,
            subjectCodes: student.subjectHours.map((item) => item.subjectCode),
          },
          message: input.message(
            student.displayName,
            teacherLabel(input.schedule, weeklyClass.teacherId),
          ),
        }),
      );
    }
  }
}

function finding(
  ruleId: keyof typeof RULE_DEFINITIONS,
  input: {
    entityRefs: EntityReference[];
    slotIds: string[];
    parameters: Record<string, FindingParameterValue>;
    message: string;
  },
): ScheduleFinding {
  const definition = RULE_DEFINITIONS[ruleId];
  const entityRefs = sortEntityRefs(input.entityRefs);
  const slotIds = uniqueSorted(input.slotIds);
  const parameters = normalizeParameters(input.parameters);
  return {
    fingerprint: fingerprintOf({
      ruleId,
      entityRefs,
      slotIds,
      parameters,
    }),
    ruleId,
    enforcement: definition.enforcement,
    severity: definition.severity,
    blocksConfirmation: definition.enforcement === 'HARD',
    entityRefs,
    slotIds,
    parameters,
    message: input.message,
  };
}

function fingerprintOf(payload: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(payload)).digest('hex')}`;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}

function sortFindings(findings: ScheduleFinding[]): ScheduleFinding[] {
  return [...findings].sort((left, right) => {
    const rule = left.ruleId.localeCompare(right.ruleId);
    if (rule !== 0) {
      return rule;
    }
    return left.fingerprint.localeCompare(right.fingerprint);
  });
}

function countFindings(findings: ScheduleFinding[]): EvaluationCounts {
  return findings.reduce<EvaluationCounts>(
    (counts, item) => {
      if (item.blocksConfirmation) {
        counts.blockingErrors += 1;
      } else if (
        item.enforcement === 'RELAXABLE' &&
        item.severity === 'ERROR'
      ) {
        counts.relaxableErrors += 1;
      } else if (item.severity === 'WARNING') {
        counts.warnings += 1;
      } else {
        counts.information += 1;
      }
      return counts;
    },
    {
      blockingErrors: 0,
      relaxableErrors: 0,
      warnings: 0,
      information: 0,
    },
  );
}

function outcomeFrom(counts: EvaluationCounts): EvaluationOutcome {
  if (counts.blockingErrors > 0) {
    return 'BLOCKED';
  }
  if (counts.relaxableErrors > 0) {
    return 'HAS_RELAXABLE_CONFLICTS';
  }
  if (counts.warnings > 0 || counts.information > 0) {
    return 'VALID_WITH_RECOMMENDATIONS';
  }
  return 'IDEAL';
}

function addScore(
  score: InternalScore,
  priority: number,
  amount: number,
): void {
  score.byPriority[priority] = (score.byPriority[priority] ?? 0) + amount;
}

function studentsForHourRules(
  schedule: Schedule,
  students: Map<string, ValidationStudent>,
): ValidationStudent[] {
  const assignedIds = new Set(
    schedule.classes.flatMap((weeklyClass) =>
      weeklyClass.assignments.map((assignment) => assignment.studentId),
    ),
  );
  return [...students.values()].filter(
    (student) => student.status === 'ACTIVE' || assignedIds.has(student.id),
  );
}

function studentClasses(schedule: Schedule): Map<string, WeeklyClass[]> {
  const result = new Map<string, WeeklyClass[]>();
  for (const weeklyClass of schedule.classes) {
    for (const assignment of weeklyClass.assignments) {
      const current = result.get(assignment.studentId) ?? [];
      current.push(weeklyClass);
      result.set(assignment.studentId, current);
    }
  }
  return result;
}

function countAssignments(schedule: Schedule, studentId: string): number {
  return schedule.classes.reduce(
    (total, weeklyClass) =>
      total +
      weeklyClass.assignments.filter(
        (assignment) => assignment.studentId === studentId,
      ).length,
    0,
  );
}

function countAssignmentsWithTeacher(
  schedule: Schedule,
  studentId: string,
  teacherId: string,
): number {
  return schedule.classes.reduce((total, weeklyClass) => {
    if (weeklyClass.teacherId !== teacherId) {
      return total;
    }
    return (
      total +
      weeklyClass.assignments.filter(
        (assignment) => assignment.studentId === studentId,
      ).length
    );
  }, 0);
}

function teachersForStudent(schedule: Schedule, studentId: string): string[] {
  return uniqueSorted(
    schedule.classes
      .filter((weeklyClass) =>
        weeklyClass.assignments.some(
          (assignment) => assignment.studentId === studentId,
        ),
      )
      .map((weeklyClass) => weeklyClass.teacherId),
  );
}

function allocatedSubjectsFor(
  schedule: Schedule,
  studentId: string,
  teacherId: string,
): SubjectCode[] {
  return schedule.subjectTeacherAllocations
    .filter(
      (allocation) =>
        allocation.studentId === studentId &&
        allocation.teacherId === teacherId,
    )
    .flatMap((allocation) =>
      allocation.subjectHours.map((item) => item.subjectCode),
    );
}

function relatedPairs(
  students: Map<string, ValidationStudent>,
): Array<[string, string]> {
  const pairs = new Set<string>();
  const result: Array<[string, string]> = [];
  for (const student of students.values()) {
    for (const relatedId of student.relatedPersonIds) {
      if (!students.has(relatedId)) {
        continue;
      }
      const [left, right] = [student.id, relatedId].sort();
      const key = `${left}:${right}`;
      if (pairs.has(key) || left === right) {
        continue;
      }
      pairs.add(key);
      result.push([left, right]);
    }
  }
  return result;
}

function sharedClasses(
  schedule: Schedule,
  leftId: string,
  rightId: string,
): string[] {
  return uniqueSorted(
    schedule.classes
      .filter(
        (weeklyClass) =>
          hasStudent(weeklyClass, leftId) && hasStudent(weeklyClass, rightId),
      )
      .map((weeklyClass) => weeklyClass.id),
  );
}

function feasibleSharedSessions(
  left: ValidationStudent,
  right: ValidationStudent,
  teachers: ValidationTeacher[],
  slots: ScheduleSlot[],
): number {
  const compatibleTeachers = teachers.filter(
    (teacher) =>
      teacherCompatibleWith(teacher, left) &&
      teacherCompatibleWith(teacher, right),
  );
  if (compatibleTeachers.length === 0) {
    return 0;
  }
  const unavailable = new Set([
    ...left.unavailableSlotIds,
    ...right.unavailableSlotIds,
  ]);
  const feasibleSlots = slots.filter(
    (slot) =>
      !unavailable.has(slot.id) &&
      compatibleTeachers.some((teacher) =>
        teacher.availableSlotIds.includes(slot.id),
      ),
  ).length;
  return Math.min(left.weeklyHoursTotal, right.weeklyHoursTotal, feasibleSlots);
}

function teacherCompatibleWith(
  teacher: ValidationTeacher,
  student: ValidationStudent,
): boolean {
  const teacherSubjects = new Set(teacher.subjectCodes);
  return (
    teacher.courseCodes.includes(student.courseCode) &&
    student.subjectHours.some((item) => teacherSubjects.has(item.subjectCode))
  );
}

function hasScienceWorkload(student: ValidationStudent): boolean {
  return student.subjectHours.some((item) =>
    SCIENCE_SUBJECT_CODES.has(item.subjectCode),
  );
}

function minimumTeachersToCover(
  subjectCodes: SubjectCode[],
  teachers: ValidationTeacher[],
): number {
  const needed = new Set(subjectCodes);
  if (needed.size === 0) {
    return 1;
  }
  const candidates = teachers.filter((teacher) =>
    teacher.subjectCodes.some((code) => needed.has(code)),
  );
  let best = Math.max(needed.size, 1);
  const total = candidates.length;
  const limit = 1 << total;
  for (let mask = 1; mask < limit; mask += 1) {
    const covered = new Set<SubjectCode>();
    let count = 0;
    for (let index = 0; index < total; index += 1) {
      if ((mask & (1 << index)) === 0) {
        continue;
      }
      count += 1;
      for (const code of candidates[index].subjectCodes) {
        if (needed.has(code)) {
          covered.add(code);
        }
      }
    }
    if (covered.size === needed.size) {
      best = Math.min(best, count);
    }
  }
  return best;
}

function intervalsOverlap(left: ScheduleSlot, right: ScheduleSlot): boolean {
  if (left.dayOfWeek !== right.dayOfWeek) {
    return false;
  }
  const leftStart = parseMinutes(left.startTime);
  const leftEnd = parseMinutes(left.endTime);
  const rightStart = parseMinutes(right.startTime);
  const rightEnd = parseMinutes(right.endTime);
  if (
    leftStart === undefined ||
    leftEnd === undefined ||
    rightStart === undefined ||
    rightEnd === undefined
  ) {
    return left.id === right.id;
  }
  return leftStart < rightEnd && rightStart < leftEnd;
}

function parseMinutes(value: string): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function isWeekday(day: string): boolean {
  return (
    day === 'MONDAY' ||
    day === 'TUESDAY' ||
    day === 'WEDNESDAY' ||
    day === 'THURSDAY' ||
    day === 'FRIDAY'
  );
}

function classLabel(schedule: Schedule, weeklyClass: WeeklyClass): string {
  return `${slotLabel(schedule, weeklyClass.slotId)} con ${teacherLabel(schedule, weeklyClass.teacherId)}`;
}

function slotLabel(schedule: Schedule, slotId: string): string {
  const slot = schedule.slots.find((item) => item.id === slotId);
  if (!slot) {
    return `en la franja ${slotId}`;
  }
  return `el ${DAY_LABELS[slot.dayOfWeek]} a las ${slot.startTime}`;
}

function teacherLabel(schedule: Schedule, teacherId: string): string {
  return (
    schedule.teachers.find((teacher) => teacher.id === teacherId)
      ?.displayName ?? teacherId
  );
}

function studentLabel(schedule: Schedule, studentId: string): string {
  for (const weeklyClass of schedule.classes) {
    const assignment = weeklyClass.assignments.find(
      (item) => item.studentId === studentId,
    );
    if (assignment) {
      return assignment.studentDisplayName;
    }
  }
  return studentId;
}

function studentName(
  schedule: Schedule,
  students: Map<string, ValidationStudent>,
  studentId: string,
): string {
  return (
    students.get(studentId)?.displayName ?? studentLabel(schedule, studentId)
  );
}

function hasStudent(weeklyClass: WeeklyClass, studentId: string): boolean {
  return weeklyClass.assignments.some(
    (assignment) => assignment.studentId === studentId,
  );
}

function sortEntityRefs(refs: EntityReference[]): EntityReference[] {
  return [...refs]
    .map((reference) => ({ ...reference }))
    .sort((left, right) => {
      const type = left.type.localeCompare(right.type);
      return type !== 0 ? type : left.id.localeCompare(right.id);
    });
}

function normalizeParameters(
  parameters: Record<string, FindingParameterValue>,
): Record<string, FindingParameterValue> {
  const normalized: Record<string, FindingParameterValue> = {};
  for (const key of Object.keys(parameters).sort()) {
    const value = parameters[key];
    normalized[key] = Array.isArray(value) ? uniqueSorted(value) : value;
  }
  return normalized;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function indexBy<T>(items: T[], key: (item: T) => string): Map<string, T> {
  return new Map(items.map((item) => [key(item), item]));
}
