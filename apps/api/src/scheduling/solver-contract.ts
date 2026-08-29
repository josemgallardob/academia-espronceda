import type {
  CourseCode,
  DayOfWeek,
  FindingSeverity,
  RuleEnforcement,
  SubjectCode,
  TeacherProfile,
} from '../database/schema/catalog';
import type { EntityType, FindingParameterValue } from './schedule';

export const SOLVER_CONTRACT_VERSION = '1.0.0';
export const DEFAULT_SOLVE_TIME_LIMIT_SECONDS = 10;
export const SOLVER_HTTP_TIMEOUT_BUFFER_SECONDS = 5;
export const SOLVER_TIMEZONE = 'Europe/Madrid';
export const SCHEDULE_SOLVER = Symbol('SCHEDULE_SOLVER');

export type SolverMode = 'STRICT' | 'RELAXED';
export type SolveOutcomeStatus =
  'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN';

export interface SolverWeeklySlot {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}

export interface SolverSubjectHours {
  subjectCode: SubjectCode;
  weeklyHours: number;
}

export interface SolverTeacher {
  id: string;
  profile: TeacherProfile;
  supportedCourseCodes: CourseCode[];
  supportedSubjectCodes: SubjectCode[];
  availableSlotIds: string[];
}

export interface SolverStudent {
  id: string;
  status: 'ACTIVE';
  courseCode: CourseCode;
  subjectHours: SolverSubjectHours[];
  weeklyHoursTotal: number;
  unavailableSlotIds: string[];
}

export interface SolverRelationship {
  studentIds: [string, string];
}

export interface SolveOptions {
  timeLimitSeconds: number;
  randomSeed: number;
}

export interface SolveScheduleRequest {
  contractVersion: string;
  ruleCatalogVersion: string;
  requestId: string;
  timezone: typeof SOLVER_TIMEZONE;
  slots: SolverWeeklySlot[];
  teachers: SolverTeacher[];
  students: SolverStudent[];
  relationships: SolverRelationship[];
  options: SolveOptions;
}

export interface SolveAttempt {
  mode: SolverMode;
  status: SolveOutcomeStatus;
  elapsedMilliseconds: number;
}

export interface SolverEntityReference {
  type: EntityType;
  id: string;
}

export interface SolverFinding {
  fingerprint: string;
  ruleId: string;
  enforcement: RuleEnforcement;
  severity: FindingSeverity;
  blocksConfirmation: boolean;
  entityRefs: SolverEntityReference[];
  slotIds: string[];
  parameters: Record<string, FindingParameterValue>;
}

export interface ScoreTier {
  priority: number;
  penalty: number;
}

export interface RuleScore {
  ruleId: string;
  priority: number;
  occurrenceCount: number;
  penalty: number;
}

export interface SolverScheduleScore {
  direction: 'MINIMIZE';
  bestScore: 0;
  tiers: ScoreTier[];
  ruleBreakdown: RuleScore[];
}

export interface SolverWeeklyClass {
  id: string;
  teacherId: string;
  slotId: string;
  studentIds: string[];
}

export interface SolverSubjectTeacherAllocation {
  studentId: string;
  teacherId: string;
  subjectHours: SolverSubjectHours[];
  totalHours: number;
}

export interface SolverSolution {
  classes: SolverWeeklyClass[];
  subjectTeacherAllocations: SolverSubjectTeacherAllocation[];
  score: SolverScheduleScore;
  findings: SolverFinding[];
}

export interface SolveScheduleResponse {
  contractVersion: string;
  ruleCatalogVersion: string;
  requestId: string;
  mode: SolverMode;
  status: SolveOutcomeStatus;
  attempts: SolveAttempt[];
  solution: SolverSolution | null;
  elapsedMilliseconds: number;
  randomSeed: number;
  timeLimitSeconds: number;
}

export interface ScheduleSolver {
  solve(request: SolveScheduleRequest): Promise<SolveScheduleResponse>;
}

export class SolverResponseParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SolverResponseParseError';
  }
}

export function solverHttpTimeoutMs(
  timeLimitSeconds: number,
  bufferSeconds = SOLVER_HTTP_TIMEOUT_BUFFER_SECONDS,
): number {
  return Math.ceil((timeLimitSeconds * 2 + bufferSeconds) * 1000);
}

export function hasUsableSolution(
  response: SolveScheduleResponse,
): response is SolveScheduleResponse & { solution: SolverSolution } {
  return (
    (response.status === 'OPTIMAL' || response.status === 'FEASIBLE') &&
    response.solution !== null
  );
}

export function parseSolveScheduleResponse(
  payload: unknown,
): SolveScheduleResponse {
  if (!isRecord(payload)) {
    throw new SolverResponseParseError('Solver response must be an object');
  }
  const solution =
    payload.solution === null || payload.solution === undefined
      ? null
      : parseSolution(payload.solution);
  const status = parseOutcomeStatus(payload.status, 'status');
  return {
    contractVersion: parseNonEmptyString(
      payload.contractVersion,
      'contractVersion',
    ),
    ruleCatalogVersion: parseNonEmptyString(
      payload.ruleCatalogVersion,
      'ruleCatalogVersion',
    ),
    requestId: parseNonEmptyString(payload.requestId, 'requestId'),
    mode: parseMode(payload.mode),
    status,
    attempts: parseAttempts(payload.attempts),
    solution,
    elapsedMilliseconds: parseNonNegativeInteger(
      payload.elapsedMilliseconds,
      'elapsedMilliseconds',
    ),
    randomSeed: parseNonNegativeInteger(payload.randomSeed, 'randomSeed'),
    timeLimitSeconds: parsePositiveNumber(
      payload.timeLimitSeconds,
      'timeLimitSeconds',
    ),
  };
}

function parseSolution(payload: unknown): SolverSolution {
  if (!isRecord(payload)) {
    throw new SolverResponseParseError('solution must be an object');
  }
  if (!Array.isArray(payload.classes)) {
    throw new SolverResponseParseError('solution.classes must be an array');
  }
  if (!Array.isArray(payload.subjectTeacherAllocations)) {
    throw new SolverResponseParseError(
      'solution.subjectTeacherAllocations must be an array',
    );
  }
  if (!Array.isArray(payload.findings)) {
    throw new SolverResponseParseError('solution.findings must be an array');
  }
  return {
    classes: payload.classes.map((item, index) =>
      parseWeeklyClass(item, `solution.classes[${index}]`),
    ),
    subjectTeacherAllocations: payload.subjectTeacherAllocations.map(
      (item, index) =>
        parseAllocation(item, `solution.subjectTeacherAllocations[${index}]`),
    ),
    score: parseScore(payload.score),
    findings: payload.findings.map((item, index) =>
      parseFinding(item, `solution.findings[${index}]`),
    ),
  };
}

function parseWeeklyClass(payload: unknown, path: string): SolverWeeklyClass {
  if (!isRecord(payload)) {
    throw new SolverResponseParseError(`${path} must be an object`);
  }
  if (!Array.isArray(payload.studentIds)) {
    throw new SolverResponseParseError(`${path}.studentIds must be an array`);
  }
  return {
    id: parseNonEmptyString(payload.id, `${path}.id`),
    teacherId: parseNonEmptyString(payload.teacherId, `${path}.teacherId`),
    slotId: parseNonEmptyString(payload.slotId, `${path}.slotId`),
    studentIds: payload.studentIds.map((studentId, index) =>
      parseNonEmptyString(studentId, `${path}.studentIds[${index}]`),
    ),
  };
}

function parseAllocation(
  payload: unknown,
  path: string,
): SolverSubjectTeacherAllocation {
  if (!isRecord(payload)) {
    throw new SolverResponseParseError(`${path} must be an object`);
  }
  if (!Array.isArray(payload.subjectHours)) {
    throw new SolverResponseParseError(`${path}.subjectHours must be an array`);
  }
  return {
    studentId: parseNonEmptyString(payload.studentId, `${path}.studentId`),
    teacherId: parseNonEmptyString(payload.teacherId, `${path}.teacherId`),
    totalHours: parsePositiveInteger(payload.totalHours, `${path}.totalHours`),
    subjectHours: payload.subjectHours.map((item, index) =>
      parseSubjectHours(item, `${path}.subjectHours[${index}]`),
    ),
  };
}

function parseSubjectHours(payload: unknown, path: string): SolverSubjectHours {
  if (!isRecord(payload)) {
    throw new SolverResponseParseError(`${path} must be an object`);
  }
  return {
    subjectCode: parseNonEmptyString(
      payload.subjectCode,
      `${path}.subjectCode`,
    ) as SubjectCode,
    weeklyHours: parsePositiveInteger(
      payload.weeklyHours,
      `${path}.weeklyHours`,
    ),
  };
}

function parseScore(payload: unknown): SolverScheduleScore {
  if (!isRecord(payload)) {
    throw new SolverResponseParseError('solution.score must be an object');
  }
  if (payload.direction !== 'MINIMIZE') {
    throw new SolverResponseParseError(
      'solution.score.direction must be MINIMIZE',
    );
  }
  if (payload.bestScore !== 0) {
    throw new SolverResponseParseError('solution.score.bestScore must be 0');
  }
  if (!Array.isArray(payload.tiers)) {
    throw new SolverResponseParseError('solution.score.tiers must be an array');
  }
  if (!Array.isArray(payload.ruleBreakdown)) {
    throw new SolverResponseParseError(
      'solution.score.ruleBreakdown must be an array',
    );
  }
  return {
    direction: 'MINIMIZE',
    bestScore: 0,
    tiers: payload.tiers.map((item, index) =>
      parseTier(item, `solution.score.tiers[${index}]`),
    ),
    ruleBreakdown: payload.ruleBreakdown.map((item, index) =>
      parseRuleScore(item, `solution.score.ruleBreakdown[${index}]`),
    ),
  };
}

function parseTier(payload: unknown, path: string): ScoreTier {
  if (!isRecord(payload)) {
    throw new SolverResponseParseError(`${path} must be an object`);
  }
  return {
    priority: parsePositiveInteger(payload.priority, `${path}.priority`),
    penalty: parseNonNegativeNumber(payload.penalty, `${path}.penalty`),
  };
}

function parseRuleScore(payload: unknown, path: string): RuleScore {
  if (!isRecord(payload)) {
    throw new SolverResponseParseError(`${path} must be an object`);
  }
  return {
    ruleId: parseNonEmptyString(payload.ruleId, `${path}.ruleId`),
    priority: parsePositiveInteger(payload.priority, `${path}.priority`),
    occurrenceCount: parseNonNegativeInteger(
      payload.occurrenceCount,
      `${path}.occurrenceCount`,
    ),
    penalty: parseNonNegativeNumber(payload.penalty, `${path}.penalty`),
  };
}

function parseFinding(payload: unknown, path: string): SolverFinding {
  if (!isRecord(payload)) {
    throw new SolverResponseParseError(`${path} must be an object`);
  }
  if (!Array.isArray(payload.entityRefs)) {
    throw new SolverResponseParseError(`${path}.entityRefs must be an array`);
  }
  if (!Array.isArray(payload.slotIds)) {
    throw new SolverResponseParseError(`${path}.slotIds must be an array`);
  }
  if (!isRecord(payload.parameters)) {
    throw new SolverResponseParseError(`${path}.parameters must be an object`);
  }
  return {
    fingerprint: parseNonEmptyString(
      payload.fingerprint,
      `${path}.fingerprint`,
    ),
    ruleId: parseNonEmptyString(payload.ruleId, `${path}.ruleId`),
    enforcement: parseNonEmptyString(
      payload.enforcement,
      `${path}.enforcement`,
    ) as RuleEnforcement,
    severity: parseNonEmptyString(
      payload.severity,
      `${path}.severity`,
    ) as FindingSeverity,
    blocksConfirmation: parseBoolean(
      payload.blocksConfirmation,
      `${path}.blocksConfirmation`,
    ),
    entityRefs: payload.entityRefs.map((item, index) =>
      parseEntityRef(item, `${path}.entityRefs[${index}]`),
    ),
    slotIds: payload.slotIds.map((slotId, index) =>
      parseNonEmptyString(slotId, `${path}.slotIds[${index}]`),
    ),
    parameters: payload.parameters as Record<string, FindingParameterValue>,
  };
}

function parseEntityRef(payload: unknown, path: string): SolverEntityReference {
  if (!isRecord(payload)) {
    throw new SolverResponseParseError(`${path} must be an object`);
  }
  return {
    type: parseNonEmptyString(payload.type, `${path}.type`) as EntityType,
    id: parseNonEmptyString(payload.id, `${path}.id`),
  };
}

function parseAttempts(payload: unknown): SolveAttempt[] {
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new SolverResponseParseError('attempts must be a non-empty array');
  }
  return payload.map((item, index) => {
    if (!isRecord(item)) {
      throw new SolverResponseParseError(
        `attempts[${index}] must be an object`,
      );
    }
    return {
      mode: parseMode(item.mode),
      status: parseOutcomeStatus(item.status, `attempts[${index}].status`),
      elapsedMilliseconds: parseNonNegativeInteger(
        item.elapsedMilliseconds,
        `attempts[${index}].elapsedMilliseconds`,
      ),
    };
  });
}

function parseMode(value: unknown): SolverMode {
  if (value === 'STRICT' || value === 'RELAXED') {
    return value;
  }
  throw new SolverResponseParseError('mode must be STRICT or RELAXED');
}

function parseOutcomeStatus(value: unknown, path: string): SolveOutcomeStatus {
  if (
    value === 'OPTIMAL' ||
    value === 'FEASIBLE' ||
    value === 'INFEASIBLE' ||
    value === 'UNKNOWN'
  ) {
    return value;
  }
  throw new SolverResponseParseError(
    `${path} must be OPTIMAL, FEASIBLE, INFEASIBLE or UNKNOWN`,
  );
}

function parseNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SolverResponseParseError(`${path} must be a non-empty string`);
  }
  return value;
}

function parseBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new SolverResponseParseError(`${path} must be a boolean`);
  }
  return value;
}

function parsePositiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new SolverResponseParseError(`${path} must be a positive integer`);
  }
  return value as number;
}

function parseNonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new SolverResponseParseError(
      `${path} must be a non-negative integer`,
    );
  }
  return value as number;
}

function parsePositiveNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !(value > 0) || !Number.isFinite(value)) {
    throw new SolverResponseParseError(`${path} must be a positive number`);
  }
  return value;
}

function parseNonNegativeNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || value < 0 || !Number.isFinite(value)) {
    throw new SolverResponseParseError(`${path} must be a non-negative number`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
