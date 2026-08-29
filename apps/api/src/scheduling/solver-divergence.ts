import { countStudentAssignments } from './schedule-aggregate';
import type { Schedule, ScheduleEvaluation } from './schedule';
import type { InternalScore } from './schedule-validator';
import {
  hasUsableSolution,
  type SolveScheduleRequest,
  type SolveScheduleResponse,
} from './solver-contract';
import type { ValidationStudent } from './validation-context';

const SCORE_PRIORITIES = [1, 2, 3, 4, 5, 6] as const;

export function detectSolverDivergence(input: {
  request: SolveScheduleRequest;
  response: SolveScheduleResponse;
  evaluation: ScheduleEvaluation;
  internalScore: InternalScore;
}): string | null {
  if (input.response.contractVersion !== input.request.contractVersion) {
    return `contractVersion ${input.response.contractVersion} does not match ${input.request.contractVersion}`;
  }
  if (
    input.response.ruleCatalogVersion !== input.request.ruleCatalogVersion ||
    input.response.ruleCatalogVersion !== input.evaluation.ruleCatalogVersion
  ) {
    return `ruleCatalogVersion ${input.response.ruleCatalogVersion} does not match NestJS ${input.evaluation.ruleCatalogVersion}`;
  }
  if (input.response.requestId !== input.request.requestId) {
    return `requestId ${input.response.requestId} does not match ${input.request.requestId}`;
  }
  if (!hasUsableSolution(input.response)) {
    return 'solver response does not include a usable solution';
  }

  const orderedTiers = [...input.response.solution.score.tiers].sort(
    (left, right) => left.priority - right.priority,
  );
  if (orderedTiers.length !== SCORE_PRIORITIES.length) {
    return `score tiers length ${orderedTiers.length} does not match ${SCORE_PRIORITIES.length}`;
  }
  for (const [index, priority] of SCORE_PRIORITIES.entries()) {
    const tier = orderedTiers[index];
    const nestPenalty = input.internalScore.lexicographic[index] ?? 0;
    if (tier.priority !== priority) {
      return `score tier ${index} has priority ${tier.priority}`;
    }
    if (tier.penalty !== nestPenalty) {
      return `priority ${priority} penalty ${tier.penalty} does not match NestJS ${nestPenalty}`;
    }
  }

  const solverCounts = countByRule(
    input.response.solution.findings.map((finding) => finding.ruleId),
  );
  const nestCounts = countByRule(
    input.evaluation.findings.map((finding) => finding.ruleId),
  );
  const ruleIds = new Set([...solverCounts.keys(), ...nestCounts.keys()]);
  for (const ruleId of ruleIds) {
    const solverCount = solverCounts.get(ruleId) ?? 0;
    const nestCount = nestCounts.get(ruleId) ?? 0;
    if (solverCount !== nestCount) {
      return `rule ${ruleId} occurred ${solverCount} times in the solver and ${nestCount} times in NestJS`;
    }
  }
  return null;
}

export function incompleteGeneratedHours(
  schedule: Schedule,
  students: ValidationStudent[],
): string | null {
  for (const student of students) {
    if (student.status !== 'ACTIVE') {
      continue;
    }
    const assignedHours = countStudentAssignments(schedule, student.id);
    if (assignedHours !== student.weeklyHoursTotal) {
      return `student ${student.id} was assigned ${assignedHours} hours instead of ${student.weeklyHoursTotal}`;
    }
  }
  return null;
}

function countByRule(ruleIds: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ruleId of ruleIds) {
    counts.set(ruleId, (counts.get(ruleId) ?? 0) + 1);
  }
  return counts;
}
