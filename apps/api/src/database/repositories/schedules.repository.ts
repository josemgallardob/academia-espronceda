import { Injectable } from '@nestjs/common';
import { and, desc, eq, ne } from 'drizzle-orm';
import type {
  EntityReference,
  EntityType,
  FindingParameterValue,
  Schedule,
  ScheduleEvaluation,
  ScheduleFinding,
  ScheduleListItem,
  SubjectTeacherAllocation,
  WeeklyClass,
} from '../../scheduling/schedule';
import { assertScheduleIntegrity } from '../../scheduling/schedule-aggregate';
import {
  ScheduleNotMutableError,
  ScheduleRevisionConflictError,
} from '../../scheduling/schedule-errors';
import { DatabaseConnection } from '../database.connection';
import {
  type NewScheduleRow,
  type ScheduleRow,
  scheduleAcceptedFindings,
  scheduleAssignments,
  scheduleClasses,
  scheduleConfirmations,
  scheduleSlots,
  scheduleTeachers,
  scheduleValidationFindings,
  scheduleValidations,
  schedules,
  subjectTeacherAllocations,
} from '../schema';
import type { ScheduleState, SubjectCode } from '../schema/catalog';
import { BaseRepository } from './base.repository';

const entityTypes = new Set<EntityType>([
  'SCHEDULE',
  'CLASS',
  'ASSIGNMENT',
  'STUDENT',
  'TEACHER',
  'SUBJECT',
  'COURSE',
  'SLOT',
  'RELATIONSHIP',
]);

@Injectable()
export class SchedulesRepository extends BaseRepository {
  constructor(connection: DatabaseConnection) {
    super(connection);
  }

  async insert(schedule: NewScheduleRow): Promise<ScheduleRow> {
    const [created] = await this.db
      .insert(schedules)
      .values(schedule)
      .returning();
    return created;
  }

  async findById(id: string): Promise<ScheduleRow | undefined> {
    return this.db.query.schedules.findFirst({ where: eq(schedules.id, id) });
  }

  async findCurrent(): Promise<ScheduleRow | undefined> {
    return this.db.query.schedules.findFirst({
      where: eq(schedules.isCurrent, true),
    });
  }

  async list(): Promise<ScheduleRow[]> {
    return this.db.select().from(schedules).orderBy(desc(schedules.createdAt));
  }

  async save(
    schedule: Schedule,
    expectedPersistedRevision: number | null,
  ): Promise<void> {
    assertScheduleIntegrity(schedule);
    await this.db.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(schedules)
        .where(eq(schedules.id, schedule.id))
        .limit(1);

      if (!existing) {
        if (expectedPersistedRevision !== null) {
          throw new ScheduleRevisionConflictError();
        }
        if (schedule.isCurrent) {
          await transaction
            .update(schedules)
            .set({ isCurrent: false, updatedAt: schedule.updatedAt })
            .where(
              and(eq(schedules.isCurrent, true), ne(schedules.id, schedule.id)),
            );
        }
        await transaction.insert(schedules).values(toHeader(schedule));
        await transaction.insert(scheduleTeachers).values(
          schedule.teachers.map((teacher) => ({
            scheduleId: schedule.id,
            teacherId: teacher.id,
            displayName: teacher.displayName,
            profile: teacher.profile,
          })),
        );
        await transaction.insert(scheduleSlots).values(
          schedule.slots.map((slot) => ({
            scheduleId: schedule.id,
            slotId: slot.id,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
          })),
        );
      } else {
        if (existing.state === 'CONFIRMED') {
          throw new ScheduleNotMutableError();
        }
        if (
          expectedPersistedRevision === null ||
          expectedPersistedRevision !== existing.revision
        ) {
          throw new ScheduleRevisionConflictError();
        }

        if (schedule.isCurrent) {
          await transaction
            .update(schedules)
            .set({ isCurrent: false, updatedAt: schedule.updatedAt })
            .where(
              and(eq(schedules.isCurrent, true), ne(schedules.id, schedule.id)),
            );
        }

        const updated = await transaction
          .update(schedules)
          .set({
            state: schedule.state,
            revision: schedule.revision,
            isCurrent: schedule.isCurrent,
            updatedAt: schedule.updatedAt,
          })
          .where(
            and(
              eq(schedules.id, schedule.id),
              eq(schedules.revision, expectedPersistedRevision),
              eq(schedules.state, existing.state),
            ),
          )
          .returning({ id: schedules.id });
        if (updated.length === 0) {
          throw new ScheduleRevisionConflictError();
        }

        await transaction
          .delete(scheduleClasses)
          .where(eq(scheduleClasses.scheduleId, schedule.id));
        await transaction
          .delete(subjectTeacherAllocations)
          .where(eq(subjectTeacherAllocations.scheduleId, schedule.id));
      }

      if (schedule.classes.length > 0) {
        await transaction.insert(scheduleClasses).values(
          schedule.classes.map((weeklyClass) => ({
            id: weeklyClass.id,
            scheduleId: schedule.id,
            teacherId: weeklyClass.teacherId,
            slotId: weeklyClass.slotId,
          })),
        );
        const assignments = schedule.classes.flatMap((weeklyClass) =>
          weeklyClass.assignments.map((assignment) => ({
            id: assignment.id,
            classId: weeklyClass.id,
            scheduleId: schedule.id,
            slotId: weeklyClass.slotId,
            personId: assignment.studentId,
            studentDisplayName: assignment.studentDisplayName,
          })),
        );
        if (assignments.length > 0) {
          await transaction.insert(scheduleAssignments).values(assignments);
        }
      }

      const allocationRows = flattenAllocations(schedule);
      if (allocationRows.length > 0) {
        await transaction
          .insert(subjectTeacherAllocations)
          .values(allocationRows);
      }

      if (schedule.evaluation) {
        await persistEvaluation(transaction, schedule.evaluation);
      }

      if (schedule.state === 'CONFIRMED') {
        await persistConfirmation(transaction, schedule);
      }
    });
  }

  async findAggregateById(id: string): Promise<Schedule | undefined> {
    return this.loadAggregate(eq(schedules.id, id));
  }

  async findCurrentAggregate(): Promise<Schedule | undefined> {
    return this.loadAggregate(eq(schedules.isCurrent, true));
  }

  async listSummaries(state?: ScheduleState): Promise<ScheduleListItem[]> {
    const rows = await this.db
      .select({
        id: schedules.id,
        state: schedules.state,
        revision: schedules.revision,
        isCurrent: schedules.isCurrent,
        createdAt: schedules.createdAt,
        confirmedAt: scheduleConfirmations.confirmedAt,
      })
      .from(schedules)
      .leftJoin(
        scheduleConfirmations,
        eq(scheduleConfirmations.scheduleId, schedules.id),
      )
      .where(state ? eq(schedules.state, state) : undefined)
      .orderBy(desc(schedules.createdAt));

    return rows.map((row) => ({
      id: row.id,
      state: row.state,
      revision: row.revision,
      isCurrent: row.isCurrent,
      createdAt: row.createdAt,
      confirmedAt: row.confirmedAt ?? null,
    }));
  }

  private async loadAggregate(
    where: ReturnType<typeof eq>,
  ): Promise<Schedule | undefined> {
    const [header] = await this.db
      .select()
      .from(schedules)
      .where(where)
      .limit(1);
    if (!header) {
      return undefined;
    }

    const [
      teacherRows,
      slotRows,
      classRows,
      assignmentRows,
      allocationRows,
      confirmation,
    ] = await Promise.all([
      this.db
        .select()
        .from(scheduleTeachers)
        .where(eq(scheduleTeachers.scheduleId, header.id)),
      this.db
        .select()
        .from(scheduleSlots)
        .where(eq(scheduleSlots.scheduleId, header.id)),
      this.db
        .select()
        .from(scheduleClasses)
        .where(eq(scheduleClasses.scheduleId, header.id)),
      this.db
        .select()
        .from(scheduleAssignments)
        .where(eq(scheduleAssignments.scheduleId, header.id)),
      this.db
        .select()
        .from(subjectTeacherAllocations)
        .where(eq(subjectTeacherAllocations.scheduleId, header.id)),
      this.db
        .select()
        .from(scheduleConfirmations)
        .where(eq(scheduleConfirmations.scheduleId, header.id))
        .then((rows) => rows[0]),
    ]);

    const acceptedRows = confirmation
      ? await this.db
          .select()
          .from(scheduleAcceptedFindings)
          .where(eq(scheduleAcceptedFindings.scheduleId, header.id))
      : [];

    const evaluation = await this.loadEvaluation(
      header.id,
      header.revision,
      confirmation?.validationId,
    );
    const classes = assembleClasses(classRows, assignmentRows, evaluation);

    const schedule: Schedule = {
      id: header.id,
      state: header.state,
      revision: header.revision,
      isCurrent: header.isCurrent,
      sourceScheduleId: header.sourceScheduleId,
      ruleCatalogVersion: header.ruleCatalogVersion,
      createdAt: header.createdAt,
      updatedAt: header.updatedAt,
      confirmedAt: confirmation?.confirmedAt ?? null,
      confirmedByUserId: confirmation?.confirmedByUserId ?? null,
      teachers: teacherRows.map((row) => ({
        id: row.teacherId,
        displayName: row.displayName,
        profile: row.profile,
      })),
      slots: slotRows.map((slot) => ({
        id: slot.slotId,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
      classes,
      subjectTeacherAllocations: groupAllocations(allocationRows),
      evaluation,
      acceptedFindingFingerprints: acceptedRows.map(
        (row) => row.findingFingerprint,
      ),
    };
    assertScheduleIntegrity(schedule);
    return schedule;
  }

  private async loadEvaluation(
    scheduleId: string,
    scheduleRevision: number,
    confirmationValidationId?: string,
  ): Promise<ScheduleEvaluation | null> {
    const [validation] = confirmationValidationId
      ? await this.db
          .select()
          .from(scheduleValidations)
          .where(eq(scheduleValidations.id, confirmationValidationId))
          .limit(1)
      : await this.db
          .select()
          .from(scheduleValidations)
          .where(
            and(
              eq(scheduleValidations.scheduleId, scheduleId),
              eq(scheduleValidations.scheduleRevision, scheduleRevision),
            ),
          )
          .orderBy(desc(scheduleValidations.evaluatedAt))
          .limit(1);
    if (!validation) {
      return null;
    }

    const findingRows = await this.db
      .select()
      .from(scheduleValidationFindings)
      .where(eq(scheduleValidationFindings.validationId, validation.id));

    return {
      id: validation.id,
      validationFingerprint: validation.validationFingerprint,
      scheduleId: validation.scheduleId,
      scheduleRevision: validation.scheduleRevision,
      ruleCatalogVersion: validation.ruleCatalogVersion,
      evaluatedAt: validation.evaluatedAt,
      outcome: validation.outcome,
      canConfirm: validation.canConfirm,
      counts: {
        blockingErrors: validation.blockingErrors,
        relaxableErrors: validation.relaxableErrors,
        warnings: validation.warnings,
        information: validation.information,
      },
      findings: findingRows.map(toFinding),
    };
  }
}

function toHeader(schedule: Schedule): NewScheduleRow {
  return {
    id: schedule.id,
    state: schedule.state,
    revision: schedule.revision,
    isCurrent: schedule.isCurrent,
    sourceScheduleId: schedule.sourceScheduleId,
    ruleCatalogVersion: schedule.ruleCatalogVersion,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}

async function persistEvaluation(
  transaction: DatabaseConnection['db'],
  evaluation: ScheduleEvaluation,
): Promise<void> {
  const [existing] = await transaction
    .select({ id: scheduleValidations.id })
    .from(scheduleValidations)
    .where(eq(scheduleValidations.id, evaluation.id))
    .limit(1);
  if (existing) {
    return;
  }
  const [sameFingerprint] = await transaction
    .select({ id: scheduleValidations.id })
    .from(scheduleValidations)
    .where(
      and(
        eq(scheduleValidations.scheduleId, evaluation.scheduleId),
        eq(scheduleValidations.scheduleRevision, evaluation.scheduleRevision),
        eq(
          scheduleValidations.validationFingerprint,
          evaluation.validationFingerprint,
        ),
      ),
    )
    .limit(1);
  if (sameFingerprint) {
    return;
  }

  await transaction.insert(scheduleValidations).values({
    id: evaluation.id,
    validationFingerprint: evaluation.validationFingerprint,
    scheduleId: evaluation.scheduleId,
    scheduleRevision: evaluation.scheduleRevision,
    ruleCatalogVersion: evaluation.ruleCatalogVersion,
    outcome: evaluation.outcome,
    canConfirm: evaluation.canConfirm,
    blockingErrors: evaluation.counts.blockingErrors,
    relaxableErrors: evaluation.counts.relaxableErrors,
    warnings: evaluation.counts.warnings,
    information: evaluation.counts.information,
    evaluatedAt: evaluation.evaluatedAt,
  });
  if (evaluation.findings.length > 0) {
    await transaction.insert(scheduleValidationFindings).values(
      evaluation.findings.map((finding) => ({
        validationId: evaluation.id,
        fingerprint: finding.fingerprint,
        ruleId: finding.ruleId,
        enforcement: finding.enforcement,
        severity: finding.severity,
        blocksConfirmation: finding.blocksConfirmation,
        entityRefsJson: JSON.stringify(finding.entityRefs),
        slotIdsJson: JSON.stringify(finding.slotIds),
        parametersJson: JSON.stringify(finding.parameters),
        message: finding.message,
      })),
    );
  }
}

async function persistConfirmation(
  transaction: DatabaseConnection['db'],
  schedule: Schedule,
): Promise<void> {
  if (
    !schedule.evaluation ||
    !schedule.confirmedByUserId ||
    !schedule.confirmedAt
  ) {
    throw new ScheduleNotMutableError(
      'Confirmed schedules require validation and actor evidence',
    );
  }
  const evaluation = schedule.evaluation;
  const confirmedByUserId = schedule.confirmedByUserId;
  const confirmedAt = schedule.confirmedAt;

  const [existing] = await transaction
    .select({ scheduleId: scheduleConfirmations.scheduleId })
    .from(scheduleConfirmations)
    .where(eq(scheduleConfirmations.scheduleId, schedule.id))
    .limit(1);
  if (existing) {
    return;
  }

  await transaction.insert(scheduleConfirmations).values({
    scheduleId: schedule.id,
    validationId: evaluation.id,
    confirmedByUserId,
    confirmedAt,
  });
  if (schedule.acceptedFindingFingerprints.length > 0) {
    await transaction.insert(scheduleAcceptedFindings).values(
      schedule.acceptedFindingFingerprints.map((findingFingerprint) => ({
        scheduleId: schedule.id,
        validationId: evaluation.id,
        findingFingerprint,
        acceptedByUserId: confirmedByUserId,
        acceptedAt: confirmedAt,
      })),
    );
  }
}

function flattenAllocations(schedule: Schedule) {
  return schedule.subjectTeacherAllocations.flatMap((allocation) =>
    allocation.subjectHours.map((item) => ({
      scheduleId: schedule.id,
      personId: allocation.studentId,
      subjectCode: item.subjectCode,
      teacherId: allocation.teacherId,
      weeklyHours: item.weeklyHours,
    })),
  );
}

function groupAllocations(
  rows: Array<{
    personId: string;
    teacherId: string;
    subjectCode: SubjectCode;
    weeklyHours: number;
  }>,
): SubjectTeacherAllocation[] {
  const grouped = new Map<string, SubjectTeacherAllocation>();
  for (const row of rows) {
    const key = `${row.personId}:${row.teacherId}`;
    const current = grouped.get(key) ?? {
      studentId: row.personId,
      teacherId: row.teacherId,
      subjectHours: [],
      totalHours: 0,
    };
    current.subjectHours.push({
      subjectCode: row.subjectCode,
      weeklyHours: row.weeklyHours,
    });
    current.totalHours += row.weeklyHours;
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

function assembleClasses(
  classRows: Array<{ id: string; teacherId: string; slotId: string }>,
  assignmentRows: Array<{
    id: string;
    classId: string;
    personId: string;
    studentDisplayName: string;
  }>,
  evaluation: ScheduleEvaluation | null,
): WeeklyClass[] {
  return classRows.map((weeklyClass) => ({
    id: weeklyClass.id,
    teacherId: weeklyClass.teacherId,
    slotId: weeklyClass.slotId,
    assignments: assignmentRows
      .filter((assignment) => assignment.classId === weeklyClass.id)
      .map((assignment) => ({
        id: assignment.id,
        studentId: assignment.personId,
        studentDisplayName: assignment.studentDisplayName,
      })),
    findingFingerprints: evaluation
      ? [
          ...new Set(
            evaluation.findings
              .filter((finding) =>
                finding.entityRefs.some(
                  (reference) =>
                    reference.type === 'CLASS' &&
                    reference.id === weeklyClass.id,
                ),
              )
              .map((finding) => finding.fingerprint),
          ),
        ]
      : [],
  }));
}

function toFinding(row: {
  fingerprint: string;
  ruleId: string;
  enforcement: ScheduleFinding['enforcement'];
  severity: ScheduleFinding['severity'];
  blocksConfirmation: boolean;
  entityRefsJson: string;
  slotIdsJson: string;
  parametersJson: string;
  message: string;
}): ScheduleFinding {
  return {
    fingerprint: row.fingerprint,
    ruleId: row.ruleId,
    enforcement: row.enforcement,
    severity: row.severity,
    blocksConfirmation: row.blocksConfirmation,
    entityRefs: parseEntityRefs(row.entityRefsJson),
    slotIds: parseStringArray(row.slotIdsJson),
    parameters: parseParameters(row.parametersJson),
    message: row.message,
  };
}

function parseEntityRefs(value: string): EntityReference[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(isEntityReference);
}

function isEntityReference(value: unknown): value is EntityReference {
  if (
    !value ||
    typeof value !== 'object' ||
    !('type' in value) ||
    !('id' in value)
  ) {
    return false;
  }
  const type = value.type;
  const id = value.id;
  return (
    typeof type === 'string' &&
    typeof id === 'string' &&
    entityTypes.has(type as EntityType)
  );
}

function parseStringArray(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}

function parseParameters(value: string): Record<string, FindingParameterValue> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const parameters: Record<string, FindingParameterValue> = {};
  for (const [key, item] of Object.entries(parsed)) {
    if (
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean' ||
      (Array.isArray(item) && item.every((entry) => typeof entry === 'string'))
    ) {
      parameters[key] = item;
    }
  }
  return parameters;
}
