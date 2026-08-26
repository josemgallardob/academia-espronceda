import type {
  DayOfWeek,
  EvaluationOutcome,
  FindingSeverity,
  RuleEnforcement,
  ScheduleState,
  SubjectCode,
  TeacherProfile,
} from '../database/schema/catalog';

export const CURRENT_RULE_CATALOG_VERSION = '1.0.0';

export const FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;

export type {
  DayOfWeek,
  EvaluationOutcome,
  FindingSeverity,
  RuleEnforcement,
  ScheduleState,
  SubjectCode,
  TeacherProfile,
};

export type EntityType =
  | 'SCHEDULE'
  | 'CLASS'
  | 'ASSIGNMENT'
  | 'STUDENT'
  | 'TEACHER'
  | 'SUBJECT'
  | 'COURSE'
  | 'SLOT'
  | 'RELATIONSHIP';

export type FindingParameterValue = string | number | boolean | string[];

export interface ScheduleTeacher {
  id: string;
  displayName: string;
  profile: TeacherProfile;
}

export interface ScheduleSlot {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
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

export interface SubjectHours {
  subjectCode: SubjectCode;
  weeklyHours: number;
}

export interface SubjectTeacherAllocation {
  studentId: string;
  teacherId: string;
  subjectHours: SubjectHours[];
  totalHours: number;
}

export interface EntityReference {
  type: EntityType;
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
  parameters: Record<string, FindingParameterValue>;
  message: string;
}

export interface EvaluationCounts {
  blockingErrors: number;
  relaxableErrors: number;
  warnings: number;
  information: number;
}

export interface ScheduleEvaluation {
  id: string;
  validationFingerprint: string;
  scheduleId: string;
  scheduleRevision: number;
  ruleCatalogVersion: string;
  evaluatedAt: string;
  outcome: EvaluationOutcome;
  canConfirm: boolean;
  counts: EvaluationCounts;
  findings: ScheduleFinding[];
}

export interface ScheduleListItem {
  id: string;
  state: ScheduleState;
  revision: number;
  isCurrent: boolean;
  createdAt: string;
  confirmedAt: string | null;
}

export interface Schedule {
  id: string;
  state: ScheduleState;
  revision: number;
  isCurrent: boolean;
  sourceScheduleId: string | null;
  ruleCatalogVersion: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
  teachers: ScheduleTeacher[];
  slots: ScheduleSlot[];
  classes: WeeklyClass[];
  subjectTeacherAllocations: SubjectTeacherAllocation[];
  evaluation: ScheduleEvaluation | null;
  acceptedFindingFingerprints: string[];
}

export interface StudentAssignmentContext {
  studentId: string;
  studentDisplayName: string;
  studentStatus: 'ACTIVE' | 'WAITING_LIST';
  weeklyHoursTotal: number;
}

export interface AddAssignmentCommand extends StudentAssignmentContext {
  expectedRevision: number;
  teacherId: string;
  slotId: string;
}

export interface RemoveAssignmentCommand {
  expectedRevision: number;
  assignmentId: string;
}

export interface MoveAssignmentCommand {
  expectedRevision: number;
  assignmentId: string;
  targetTeacherId: string;
  targetSlotId: string;
}

export interface SetAllocationsCommand {
  expectedRevision: number;
  studentId: string;
  allocations: SubjectTeacherAllocation[];
}

export interface ConfirmScheduleCommand {
  expectedRevision: number;
  validationFingerprint: string;
  acceptRelaxableConflicts: boolean;
  userId: string;
  confirmedAt: string;
}

export interface NewIdentity {
  assignmentId: string;
  classId: string;
  updatedAt: string;
}
