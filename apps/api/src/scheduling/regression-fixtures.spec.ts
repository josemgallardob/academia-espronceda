import {
  loadInvalidSolution,
  loadRegressionCases,
  loadRegressionRequest,
  loadRegressionResponse,
  scheduleFromSolverSolution,
  validationContextFromRequest,
} from './regression-fixtures';
import { evaluateSchedule } from './schedule-validator';
import { hasUsableSolution } from './solver-contract';
import { detectSolverDivergence } from './solver-divergence';

describe('cross-runtime regression fixtures', () => {
  const cases = loadRegressionCases();

  it('publishes the eight named reference problems', () => {
    expect(cases.map((item) => item.id)).toEqual([
      'minimal-valid',
      'multiple-valid-solutions',
      'impossible-availability',
      'student-overlap',
      'insufficient-capacity',
      'cross-subject-teachers',
      'best-effort-required',
      'weekly-hours-exceeded',
    ]);
  });

  it.each(
    cases.filter((item) => item.response && item.solve.hasUsableSolution),
  )('accepts the published $id solver solution without divergence', (item) => {
    const request = loadRegressionRequest(item.request);
    const response = loadRegressionResponse(item.response!);
    expect(hasUsableSolution(response)).toBe(true);
    expect(response.mode).toBe(item.solve.mode);
    expect(item.solve.statuses).toContain(response.status);

    const context = validationContextFromRequest(request);
    const schedule = scheduleFromSolverSolution(request, response.solution);
    const { evaluation, internalScore } = evaluateSchedule(schedule, context, {
      purpose: 'DRAFT_VALIDATION',
      evaluatedAt: '2026-08-30T12:00:00.000Z',
    });
    const findingIds = evaluation.findings.map((finding) => finding.ruleId);
    expect(findingIds).toEqual(
      expect.arrayContaining(item.solve.requiredFindingRuleIds ?? []),
    );
    expect(findingIds).not.toEqual(
      expect.arrayContaining(item.solve.forbiddenFindingRuleIds ?? []),
    );
    expect(
      detectSolverDivergence({
        request,
        response,
        evaluation,
        internalScore,
      }),
    ).toBeNull();
  });

  it.each(
    cases.filter((item) => item.response && !item.solve.hasUsableSolution),
  )('publishes $id as infeasible without a usable solution', (item) => {
    const request = loadRegressionRequest(item.request);
    const response = loadRegressionResponse(item.response!);
    expect(response.requestId).toBe(request.requestId);
    expect(response.mode).toBe(item.solve.mode);
    expect(item.solve.statuses).toContain(response.status);
    expect(hasUsableSolution(response)).toBe(false);
  });

  it.each(cases.filter((item) => item.evaluate && item.invalidSolution))(
    'flags the invalid $id schedule with the expected NestJS findings',
    (item) => {
      const request = loadRegressionRequest(item.request);
      const invalid = loadInvalidSolution(item.invalidSolution!);
      const schedule = scheduleFromSolverSolution(request, invalid);
      const { evaluation } = evaluateSchedule(
        schedule,
        validationContextFromRequest(request),
        {
          purpose: 'DRAFT_VALIDATION',
          evaluatedAt: '2026-08-30T12:00:00.000Z',
        },
      );
      const findingIds = evaluation.findings.map((finding) => finding.ruleId);
      expect(findingIds).toEqual(
        expect.arrayContaining(item.evaluate!.requiredFindingRuleIds),
      );
    },
  );

  it('fails divergence when a published solution hides excess weekly hours', () => {
    const item = cases.find((entry) => entry.id === 'weekly-hours-exceeded');
    expect(item).toBeDefined();
    const request = loadRegressionRequest(item!.request);
    const valid = loadRegressionResponse(item!.response!);
    expect(hasUsableSolution(valid)).toBe(true);
    if (!hasUsableSolution(valid)) {
      throw new Error('weekly-hours-exceeded must publish a usable solution');
    }
    const hidden = {
      ...valid,
      solution: {
        ...valid.solution,
        classes: loadInvalidSolution(item!.invalidSolution!).classes,
        findings: [],
        score: {
          ...valid.solution.score,
          tiers: [1, 2, 3, 4, 5, 6].map((priority) => ({
            priority,
            penalty: 0,
          })),
          ruleBreakdown: [],
        },
      },
    };
    const schedule = scheduleFromSolverSolution(request, hidden.solution);
    const { evaluation, internalScore } = evaluateSchedule(
      schedule,
      validationContextFromRequest(request),
      {
        purpose: 'DRAFT_VALIDATION',
        evaluatedAt: '2026-08-30T12:00:00.000Z',
      },
    );
    expect(evaluation.findings.map((finding) => finding.ruleId)).toContain(
      'STUDENT_WEEKLY_HOURS_EXACT',
    );
    expect(
      detectSolverDivergence({
        request,
        response: hidden,
        evaluation,
        internalScore,
      }),
    ).not.toBeNull();
  });
});
