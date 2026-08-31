import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyGeneratedSolution, createEmptyDraft } from './schedule-aggregate';
import type { Schedule } from './schedule';
import {
  parseSolveScheduleResponse,
  type SolveScheduleRequest,
  type SolveScheduleResponse,
  type SolverSolution,
} from './solver-contract';
import { toDraftClasses } from './solver-solution.mapper';
import type {
  ValidationContext,
  ValidationStudent,
  ValidationTeacher,
} from './validation-context';

export const REGRESSION_FIXTURE_DIR = resolve(
  __dirname,
  '../../../../contracts/fixtures/v1/regression',
);

export interface RegressionSolveExpectation {
  hasUsableSolution: boolean;
  mode: 'STRICT' | 'RELAXED';
  statuses: Array<'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN'>;
  requiredFindingRuleIds?: string[];
  forbiddenFindingRuleIds?: string[];
  allowMultipleSolutions?: boolean;
}

export interface RegressionEvaluateExpectation {
  requiredFindingRuleIds: string[];
}

export interface RegressionCase {
  id: string;
  request: string;
  response?: string;
  invalidSolution?: string;
  solve: RegressionSolveExpectation;
  evaluate?: RegressionEvaluateExpectation;
}

interface RegressionBattery {
  batteryVersion: string;
  cases: RegressionCase[];
}

export function loadRegressionCases(): RegressionCase[] {
  return readRegressionJson<RegressionBattery>('cases.json').cases;
}

export function loadRegressionRequest(name: string): SolveScheduleRequest {
  return readRegressionJson<SolveScheduleRequest>(name);
}

export function loadRegressionResponse(name: string): SolveScheduleResponse {
  return parseSolveScheduleResponse(readRegressionJson<unknown>(name));
}

export function loadInvalidSolution(
  name: string,
): Pick<SolverSolution, 'classes' | 'subjectTeacherAllocations'> {
  return readRegressionJson<
    Pick<SolverSolution, 'classes' | 'subjectTeacherAllocations'>
  >(name);
}

export function validationContextFromRequest(
  request: SolveScheduleRequest,
): ValidationContext {
  const related = new Map<string, string[]>();
  for (const relationship of request.relationships) {
    const [left, right] = relationship.studentIds;
    related.set(left, [...(related.get(left) ?? []), right]);
    related.set(right, [...(related.get(right) ?? []), left]);
  }

  const teachers: ValidationTeacher[] = request.teachers.map((teacher) => ({
    id: teacher.id,
    displayName: teacher.id,
    profile: teacher.profile,
    subjectCodes: teacher.supportedSubjectCodes,
    courseCodes: teacher.supportedCourseCodes,
    availableSlotIds: teacher.availableSlotIds,
  }));
  const students: ValidationStudent[] = request.students.map((student) => ({
    id: student.id,
    displayName: student.id,
    status: student.status,
    courseCode: student.courseCode,
    subjectHours: student.subjectHours.map((item) => ({
      subjectCode: item.subjectCode,
      weeklyHours: item.weeklyHours,
    })),
    weeklyHoursTotal: student.weeklyHoursTotal,
    unavailableSlotIds: student.unavailableSlotIds,
    relatedPersonIds: related.get(student.id) ?? [],
  }));
  return { teachers, students };
}

export function scheduleFromSolverSolution(
  request: SolveScheduleRequest,
  solution: Pick<SolverSolution, 'classes' | 'subjectTeacherAllocations'>,
): Schedule {
  const context = validationContextFromRequest(request);
  const draft = createEmptyDraft({
    id: `schedule-${request.requestId}`,
    createdAt: '2026-08-30T12:00:00.000Z',
    teachers: context.teachers.map((teacher) => ({
      id: teacher.id,
      displayName: teacher.displayName,
      profile: teacher.profile,
    })),
    slots: request.slots,
  });
  const names = new Map(
    context.students.map((student) => [
      student.id,
      { displayName: student.displayName },
    ]),
  );
  let nextIdentity = 0;
  return applyGeneratedSolution(
    draft,
    toDraftClasses(
      {
        classes: solution.classes,
        subjectTeacherAllocations: solution.subjectTeacherAllocations,
        findings: [],
        score: {
          direction: 'MINIMIZE',
          bestScore: 0,
          tiers: [1, 2, 3, 4, 5, 6].map((priority) => ({
            priority,
            penalty: 0,
          })),
          ruleBreakdown: [],
        },
      },
      names,
      () => {
        nextIdentity += 1;
        return `generated-${nextIdentity}`;
      },
    ),
  );
}

function readRegressionJson<T>(name: string): T {
  return JSON.parse(
    readFileSync(resolve(REGRESSION_FIXTURE_DIR, name), 'utf8'),
  ) as T;
}
