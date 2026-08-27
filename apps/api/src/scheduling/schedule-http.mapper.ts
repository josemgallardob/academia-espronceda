import type {
  Schedule,
  ScheduleEvaluation,
  ScheduleListItem,
} from './schedule';

export type PublicScheduleEvaluation = Omit<ScheduleEvaluation, 'id'>;

export interface PublicSchedule extends Omit<
  Schedule,
  'updatedAt' | 'evaluation' | 'teachers'
> {
  teachers: Array<{ id: string; displayName: string }>;
  evaluation: PublicScheduleEvaluation | null;
}

export function toPublicEvaluation(
  evaluation: ScheduleEvaluation,
): PublicScheduleEvaluation {
  return {
    validationFingerprint: evaluation.validationFingerprint,
    scheduleId: evaluation.scheduleId,
    scheduleRevision: evaluation.scheduleRevision,
    ruleCatalogVersion: evaluation.ruleCatalogVersion,
    evaluatedAt: evaluation.evaluatedAt,
    outcome: evaluation.outcome,
    canConfirm: evaluation.canConfirm,
    counts: evaluation.counts,
    findings: evaluation.findings,
  };
}

export function toPublicSchedule(schedule: Schedule): PublicSchedule {
  return {
    id: schedule.id,
    state: schedule.state,
    revision: schedule.revision,
    isCurrent: schedule.isCurrent,
    sourceScheduleId: schedule.sourceScheduleId,
    ruleCatalogVersion: schedule.ruleCatalogVersion,
    createdAt: schedule.createdAt,
    confirmedAt: schedule.confirmedAt,
    confirmedByUserId: schedule.confirmedByUserId,
    teachers: schedule.teachers.map(({ id, displayName }) => ({
      id,
      displayName,
    })),
    slots: schedule.slots,
    classes: schedule.classes,
    subjectTeacherAllocations: schedule.subjectTeacherAllocations,
    evaluation: schedule.evaluation
      ? toPublicEvaluation(schedule.evaluation)
      : null,
    acceptedFindingFingerprints: schedule.acceptedFindingFingerprints,
  };
}

export function toScheduleListResponse(items: ScheduleListItem[]) {
  return { items, total: items.length };
}

export function toMutationResponse(schedule: Schedule) {
  return { schedule: toPublicSchedule(schedule) };
}
