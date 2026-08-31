import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { currentOrNewRequestId } from '../observability/request-context';
import { PeopleRepository } from '../database/repositories/people.repository';
import { SchedulesRepository } from '../database/repositories/schedules.repository';
import { TeachersRepository } from '../database/repositories/teachers.repository';
import { UsersRepository } from '../database/repositories/users.repository';
import { WeeklySlotsRepository } from '../database/repositories/weekly-slots.repository';
import type { ScheduleState } from '../database/schema/catalog';
import { ProblemDetailsException } from '../http/problem-details.exception';
import {
  addAssignment,
  applyGeneratedSolution,
  attachEvaluation,
  confirmSchedule,
  createDraftFromConfirmed,
  createEmptyDraft,
  moveAssignment,
  removeAssignment,
  setSubjectTeacherAllocations,
  studentDisplayName,
  withCatalogSlots,
} from './schedule-aggregate';
import {
  CURRENT_RULE_CATALOG_VERSION,
  type Schedule,
  type ScheduleEvaluation,
} from './schedule';
import {
  ScheduleIntegrityError,
  ScheduleNotFoundError,
  ScheduleRevisionConflictError,
} from './schedule-errors';
import { evaluateSchedule } from './schedule-validator';
import {
  hasUsableSolution,
  SCHEDULE_SOLVER,
  type ScheduleSolver,
} from './solver-contract';
import {
  detectSolverDivergence,
  incompleteGeneratedHours,
} from './solver-divergence';
import {
  generationInfeasible,
  solverInvalidResponse,
  solverResultDiverged,
} from './solver-errors';
import { toSolveScheduleRequest } from './solver-request.mapper';
import { toDraftClasses } from './solver-solution.mapper';
import type {
  ValidationContext,
  ValidationPurpose,
} from './validation-context';

@Injectable()
export class SchedulesService {
  constructor(
    private readonly schedules: SchedulesRepository,
    private readonly people: PeopleRepository,
    private readonly teachers: TeachersRepository,
    private readonly weeklySlots: WeeklySlotsRepository,
    private readonly users: UsersRepository,
    @Inject(SCHEDULE_SOLVER) private readonly solver: ScheduleSolver,
  ) {}

  async generateDraft(): Promise<Schedule> {
    const catalog = await this.loadLiveCatalog();
    const requestId = currentOrNewRequestId();
    const request = toSolveScheduleRequest({
      requestId,
      slots: catalog.slots,
      teachers: catalog.context.teachers,
      students: catalog.context.students,
    });
    const response = await this.solver.solve(request);
    if (!hasUsableSolution(response)) {
      throw generationInfeasible();
    }

    const draft = createEmptyDraft({
      id: randomUUID(),
      createdAt: now(),
      ruleCatalogVersion: CURRENT_RULE_CATALOG_VERSION,
      teachers: catalog.teachers.map((teacher) => ({
        id: teacher.id,
        displayName: teacher.displayName,
        profile: teacher.profile,
      })),
      slots: catalog.slots,
    });
    let generated: Schedule;
    try {
      generated = applyGeneratedSolution(
        draft,
        toDraftClasses(
          response.solution,
          studentNames(catalog.context.students),
        ),
      );
    } catch (error) {
      if (error instanceof ScheduleIntegrityError) {
        throw solverInvalidResponse(error.message);
      }
      throw error;
    }

    const incompleteHours = incompleteGeneratedHours(
      generated,
      catalog.context.students,
    );
    if (incompleteHours) {
      throw solverResultDiverged(incompleteHours);
    }

    const { evaluation, internalScore } = evaluateSchedule(
      generated,
      catalog.context,
      { purpose: 'DRAFT_VALIDATION' },
    );
    const divergence = detectSolverDivergence({
      request,
      response,
      evaluation,
      internalScore,
    });
    if (divergence) {
      throw solverResultDiverged(divergence);
    }

    const next = attachEvaluation(
      generated,
      reuseEvaluationIdentity(generated, evaluation),
      generated.revision,
    );
    await this.schedules.save(next, null);
    return next;
  }

  async createEmptyDraft(): Promise<Schedule> {
    const [teachers, slots] = await Promise.all([
      this.teachers.listActive(),
      this.weeklySlots.listActive(),
    ]);
    const createdAt = now();
    const schedule = createEmptyDraft({
      id: randomUUID(),
      createdAt,
      ruleCatalogVersion: CURRENT_RULE_CATALOG_VERSION,
      teachers: teachers.map((teacher) => ({
        id: teacher.id,
        displayName: teacher.displayName,
        profile: teacher.profile,
      })),
      slots,
    });
    return this.persistEvaluated(schedule, null, 'DRAFT_VALIDATION');
  }

  async createRevisionFromConfirmed(scheduleId: string): Promise<Schedule> {
    const source = await this.requireSchedule(scheduleId);
    const createdAt = now();
    const draft = createDraftFromConfirmed(source, {
      id: randomUUID(),
      createdAt,
      identity: () => randomUUID(),
    });
    return this.persistEvaluated(draft, null, 'DRAFT_VALIDATION');
  }

  async get(scheduleId: string): Promise<Schedule> {
    return this.requireSchedule(scheduleId);
  }

  async getCurrent(): Promise<Schedule> {
    const schedule = await this.schedules.findCurrentAggregate();
    if (!schedule) {
      throw new ScheduleNotFoundError('current');
    }
    return this.ensureDraftHasCatalogSlots(schedule);
  }

  async list(state?: ScheduleState) {
    return this.schedules.listSummaries(state);
  }

  async addAssignment(
    scheduleId: string,
    command: {
      expectedRevision: number;
      studentId: string;
      teacherId: string;
      slotId: string;
    },
  ): Promise<Schedule> {
    const [schedule, person] = await Promise.all([
      this.requireSchedule(scheduleId),
      this.people.findAggregateById(command.studentId),
    ]);
    if (!person) {
      throw studentNotFound(command.studentId);
    }
    const next = addAssignment(
      schedule,
      {
        expectedRevision: command.expectedRevision,
        studentId: person.person.id,
        studentDisplayName: studentDisplayName(person.person),
        studentStatus: person.person.status,
        weeklyHoursTotal: person.person.weeklyHoursTotal,
        teacherId: command.teacherId,
        slotId: command.slotId,
      },
      { assignmentId: randomUUID(), classId: randomUUID(), updatedAt: now() },
    );
    return this.persistEvaluated(next, schedule.revision, 'DRAFT_VALIDATION');
  }

  async removeAssignment(
    scheduleId: string,
    command: { expectedRevision: number; assignmentId: string },
  ): Promise<Schedule> {
    const schedule = await this.requireSchedule(scheduleId);
    const next = removeAssignment(schedule, command, now());
    return this.persistEvaluated(next, schedule.revision, 'DRAFT_VALIDATION');
  }

  async moveAssignment(
    scheduleId: string,
    command: {
      expectedRevision: number;
      assignmentId: string;
      targetTeacherId: string;
      targetSlotId: string;
    },
  ): Promise<Schedule> {
    const schedule = await this.requireSchedule(scheduleId);
    const next = moveAssignment(schedule, command, {
      assignmentId: command.assignmentId,
      classId: randomUUID(),
      updatedAt: now(),
    });
    return this.persistEvaluated(next, schedule.revision, 'DRAFT_VALIDATION');
  }

  async setSubjectTeacherAllocations(
    scheduleId: string,
    studentId: string,
    command: {
      expectedRevision: number;
      allocations: Parameters<
        typeof setSubjectTeacherAllocations
      >[1]['allocations'];
    },
  ): Promise<Schedule> {
    const schedule = await this.requireSchedule(scheduleId);
    const next = setSubjectTeacherAllocations(
      schedule,
      {
        expectedRevision: command.expectedRevision,
        studentId,
        allocations: command.allocations,
      },
      now(),
    );
    return this.persistEvaluated(next, schedule.revision, 'DRAFT_VALIDATION');
  }

  async validate(
    scheduleId: string,
    expectedRevision: number,
  ): Promise<Schedule> {
    const schedule = await this.requireSchedule(scheduleId);
    if (schedule.revision !== expectedRevision) {
      throw new ScheduleRevisionConflictError();
    }
    return this.persistEvaluated(schedule, schedule.revision, 'CONFIRMATION');
  }

  async confirm(
    scheduleId: string,
    command: {
      expectedRevision: number;
      validationFingerprint: string;
      acceptRelaxableConflicts: boolean;
      userId: string;
    },
  ): Promise<Schedule> {
    const [schedule, user] = await Promise.all([
      this.requireSchedule(scheduleId),
      this.users.findById(command.userId),
    ]);
    if (!user || !user.isActive) {
      throw new ScheduleIntegrityError(
        'Confirmation requires an active administrative user',
      );
    }
    if (schedule.revision !== command.expectedRevision) {
      throw new ScheduleRevisionConflictError();
    }
    const context = await this.loadValidationContext(schedule);
    const { evaluation } = evaluateSchedule(schedule, context, {
      purpose: 'CONFIRMATION',
    });
    const evaluated = attachEvaluation(
      schedule,
      reuseEvaluationIdentity(schedule, evaluation),
      schedule.revision,
    );
    const next = confirmSchedule(evaluated, {
      ...command,
      validationFingerprint: command.validationFingerprint,
      confirmedAt: now(),
    });
    await this.schedules.save(next, schedule.revision);
    return next;
  }

  private async persistEvaluated(
    schedule: Schedule,
    previousRevision: number | null,
    purpose: ValidationPurpose,
  ): Promise<Schedule> {
    const context = await this.loadValidationContext(schedule);
    const { evaluation } = evaluateSchedule(schedule, context, { purpose });
    const next = attachEvaluation(
      schedule,
      reuseEvaluationIdentity(schedule, evaluation),
      schedule.revision,
    );
    await this.schedules.save(next, previousRevision);
    return next;
  }

  private async loadLiveCatalog(): Promise<{
    teachers: Awaited<ReturnType<TeachersRepository['listActive']>>;
    slots: Awaited<ReturnType<WeeklySlotsRepository['listActive']>>;
    context: ValidationContext;
  }> {
    const [teachers, slots, people] = await Promise.all([
      this.teachers.listActive(),
      this.weeklySlots.listActive(),
      this.people.listAggregates(),
    ]);
    return {
      teachers,
      slots,
      context: await this.buildValidationContext(
        teachers.map((teacher) => ({
          id: teacher.id,
          displayName: teacher.displayName,
          profile: teacher.profile,
        })),
        people,
      ),
    };
  }

  private async loadValidationContext(
    schedule: Schedule,
  ): Promise<ValidationContext> {
    return this.buildValidationContext(
      schedule.teachers,
      await this.people.listAggregates(),
    );
  }

  private async buildValidationContext(
    teachers: Array<{
      id: string;
      displayName: string;
      profile: Schedule['teachers'][number]['profile'];
    }>,
    people: Awaited<ReturnType<PeopleRepository['listAggregates']>>,
  ): Promise<ValidationContext> {
    const teacherCapabilities = await this.teachers.listCapabilities(
      teachers.map((teacher) => teacher.id),
    );
    const teachersById = new Map(
      teacherCapabilities.map((teacher) => [teacher.id, teacher]),
    );
    return {
      students: people.map((aggregate) => ({
        id: aggregate.person.id,
        displayName: studentDisplayName(aggregate.person),
        status: aggregate.person.status,
        courseCode: aggregate.person.courseCode,
        subjectHours: aggregate.subjects,
        weeklyHoursTotal: aggregate.person.weeklyHoursTotal,
        unavailableSlotIds: aggregate.unavailableSlotIds,
        relatedPersonIds: aggregate.relatedPersonIds,
      })),
      teachers: teachers.map((snapshot) => {
        const live = teachersById.get(snapshot.id);
        return {
          id: snapshot.id,
          displayName: snapshot.displayName,
          profile: snapshot.profile,
          subjectCodes: live?.subjectCodes ?? [],
          courseCodes: live?.courseCodes ?? [],
          availableSlotIds: live?.availableSlotIds ?? [],
        };
      }),
    };
  }

  private async requireSchedule(scheduleId: string): Promise<Schedule> {
    const schedule = await this.schedules.findAggregateById(scheduleId);
    if (!schedule) {
      throw new ScheduleNotFoundError(scheduleId);
    }
    return this.ensureDraftHasCatalogSlots(schedule);
  }

  private async ensureDraftHasCatalogSlots(
    schedule: Schedule,
  ): Promise<Schedule> {
    if (schedule.state !== 'DRAFT') {
      return schedule;
    }
    const { schedule: merged, added } = withCatalogSlots(
      schedule,
      await this.weeklySlots.listActive(),
    );
    if (added.length === 0) {
      return schedule;
    }
    await this.schedules.insertMissingSlots(schedule.id, added);
    return merged;
  }
}

function reuseEvaluationIdentity(
  schedule: Schedule,
  evaluation: ScheduleEvaluation,
): ScheduleEvaluation {
  if (
    schedule.evaluation &&
    schedule.evaluation.validationFingerprint ===
      evaluation.validationFingerprint &&
    schedule.evaluation.scheduleRevision === evaluation.scheduleRevision
  ) {
    return { ...evaluation, id: schedule.evaluation.id };
  }
  return evaluation;
}

function now(): string {
  return new Date().toISOString();
}

function studentNames(
  students: ValidationContext['students'],
): Map<string, { displayName: string }> {
  return new Map(
    students.map((student) => [
      student.id,
      { displayName: student.displayName },
    ]),
  );
}

function studentNotFound(studentId: string): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 404,
    code: 'STUDENT_NOT_FOUND',
    title: 'Alumno no encontrado',
    detail: `No existe ningún alumno con identificador ${studentId}.`,
  });
}
