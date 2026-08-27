import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PeopleRepository } from '../database/repositories/people.repository';
import { SchedulesRepository } from '../database/repositories/schedules.repository';
import { TeachersRepository } from '../database/repositories/teachers.repository';
import { UsersRepository } from '../database/repositories/users.repository';
import { WeeklySlotsRepository } from '../database/repositories/weekly-slots.repository';
import type { ScheduleState } from '../database/schema/catalog';
import {
  addAssignment,
  attachEvaluation,
  confirmSchedule,
  createDraftFromConfirmed,
  createEmptyDraft,
  moveAssignment,
  removeAssignment,
  setSubjectTeacherAllocations,
  studentDisplayName,
} from './schedule-aggregate';
import {
  CURRENT_RULE_CATALOG_VERSION,
  type Schedule,
  type ScheduleEvaluation,
} from './schedule';
import {
  ScheduleIntegrityError,
  ScheduleNotFoundError,
} from './schedule-errors';

@Injectable()
export class SchedulesService {
  constructor(
    private readonly schedules: SchedulesRepository,
    private readonly people: PeopleRepository,
    private readonly teachers: TeachersRepository,
    private readonly weeklySlots: WeeklySlotsRepository,
    private readonly users: UsersRepository,
  ) {}

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
    await this.schedules.save(schedule, null);
    return schedule;
  }

  async createRevisionFromConfirmed(scheduleId: string): Promise<Schedule> {
    const source = await this.requireSchedule(scheduleId);
    const createdAt = now();
    const draft = createDraftFromConfirmed(source, {
      id: randomUUID(),
      createdAt,
      identity: () => randomUUID(),
    });
    await this.schedules.save(draft, null);
    return draft;
  }

  async get(scheduleId: string): Promise<Schedule> {
    return this.requireSchedule(scheduleId);
  }

  async getCurrent(): Promise<Schedule | undefined> {
    return this.schedules.findCurrentAggregate();
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
      throw new ScheduleIntegrityError('The requested student does not exist');
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
    await this.schedules.save(next, schedule.revision);
    return next;
  }

  async removeAssignment(
    scheduleId: string,
    command: { expectedRevision: number; assignmentId: string },
  ): Promise<Schedule> {
    const schedule = await this.requireSchedule(scheduleId);
    const next = removeAssignment(schedule, command, now());
    await this.schedules.save(next, schedule.revision);
    return next;
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
    await this.schedules.save(next, schedule.revision);
    return next;
  }

  async setSubjectTeacherAllocations(
    scheduleId: string,
    command: Parameters<typeof setSubjectTeacherAllocations>[1],
  ): Promise<Schedule> {
    const schedule = await this.requireSchedule(scheduleId);
    const next = setSubjectTeacherAllocations(schedule, command, now());
    await this.schedules.save(next, schedule.revision);
    return next;
  }

  async attachEvaluation(
    scheduleId: string,
    evaluation: ScheduleEvaluation,
    expectedRevision: number,
  ): Promise<Schedule> {
    const schedule = await this.requireSchedule(scheduleId);
    const next = attachEvaluation(schedule, evaluation, expectedRevision);
    await this.schedules.save(next, schedule.revision);
    return next;
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
    const next = confirmSchedule(schedule, {
      ...command,
      confirmedAt: now(),
    });
    await this.schedules.save(next, schedule.revision);
    return next;
  }

  private async requireSchedule(scheduleId: string): Promise<Schedule> {
    const schedule = await this.schedules.findAggregateById(scheduleId);
    if (!schedule) {
      throw new ScheduleNotFoundError(scheduleId);
    }
    return schedule;
  }
}

function now(): string {
  return new Date().toISOString();
}
