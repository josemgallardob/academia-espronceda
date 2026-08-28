import type { DayOfWeek, Person } from '../people/people.models';

export type ScheduleState = 'DRAFT' | 'CONFIRMED';
export type EvaluationOutcome =
  'IDEAL' | 'VALID_WITH_RECOMMENDATIONS' | 'HAS_RELAXABLE_CONFLICTS' | 'BLOCKED';
export type RuleEnforcement = 'HARD' | 'RELAXABLE' | 'PREFERENCE';
export type FindingSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface TeacherOption {
  id: string;
  displayName: string;
  availableSlotIds?: string[];
}

export interface WeeklySlot {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}

export interface WeekHourRow {
  startTime: string;
  endTime: string;
  cells: Array<WeeklySlot | null>;
}

export interface ScheduleAssignment {
  id: string;
  studentId: string;
  studentDisplayName: string;
}

export interface WeeklyClass {
  id: string;
  teacherId: string;
  slotId: string;
  assignments: ScheduleAssignment[];
  findingFingerprints: string[];
}

export interface EntityReference {
  type: string;
  id: string;
}

export interface ScheduleFinding {
  fingerprint: string;
  ruleId: string;
  enforcement: RuleEnforcement;
  severity: FindingSeverity;
  blocksConfirmation: boolean;
  entityRefs: EntityReference[];
  slotIds: string[];
  parameters: Record<string, string | number | boolean | string[]>;
  message: string;
}

export interface ScheduleEvaluation {
  validationFingerprint: string;
  scheduleId: string;
  scheduleRevision: number;
  ruleCatalogVersion: string;
  evaluatedAt: string;
  outcome: EvaluationOutcome;
  canConfirm: boolean;
  counts: {
    blockingErrors: number;
    relaxableErrors: number;
    warnings: number;
    information: number;
  };
  findings: ScheduleFinding[];
}

export interface Schedule {
  id: string;
  state: ScheduleState;
  revision: number;
  isCurrent: boolean;
  sourceScheduleId: string | null;
  ruleCatalogVersion: string;
  createdAt: string;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
  teachers: TeacherOption[];
  slots: WeeklySlot[];
  classes: WeeklyClass[];
  subjectTeacherAllocations: unknown[];
  evaluation: ScheduleEvaluation | null;
  acceptedFindingFingerprints: string[];
}

export interface ScheduleListItem {
  id: string;
  state: ScheduleState;
  revision: number;
  isCurrent: boolean;
  createdAt: string;
  confirmedAt: string | null;
}

export interface ScheduleListResponse {
  items: ScheduleListItem[];
  total: number;
}

export interface ScheduleMutationResponse {
  schedule: Schedule;
}

export interface StudentHours {
  person: Person;
  assignedHours: number;
  remainingHours: number;
}

export type ScheduleWorkspaceState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready'; schedule: Schedule }
  | { kind: 'error'; message: string };

export const WEEK_DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: 'Lunes',
  TUESDAY: 'Martes',
  WEDNESDAY: 'Miércoles',
  THURSDAY: 'Jueves',
  FRIDAY: 'Viernes',
};
