import {
  defaultSlots,
  emptySchedule,
  generalSciences,
  student,
  withClass,
} from './schedule-validator.fixtures';
import { evaluateSchedule } from './schedule-validator';
import {
  detectSolverDivergence,
  incompleteGeneratedHours,
} from './solver-divergence';
import type {
  SolveScheduleRequest,
  SolveScheduleResponse,
  SolverSolution,
} from './solver-contract';

describe('solver divergence', () => {
  const students = [
    student({ id: 'student-1', displayName: 'Ana' }),
    student({ id: 'student-2', displayName: 'Luis' }),
    student({ id: 'student-3', displayName: 'Marta' }),
    student({ id: 'student-4', displayName: 'Pablo' }),
  ];
  const request: SolveScheduleRequest = {
    contractVersion: '1.0.0',
    ruleCatalogVersion: '1.0.0',
    requestId: 'request-1',
    timezone: 'Europe/Madrid',
    slots: defaultSlots,
    teachers: [
      {
        id: generalSciences.id,
        profile: generalSciences.profile,
        supportedCourseCodes: generalSciences.courseCodes,
        supportedSubjectCodes: generalSciences.subjectCodes,
        availableSlotIds: generalSciences.availableSlotIds,
      },
    ],
    students: students.map((item) => ({
      id: item.id,
      status: 'ACTIVE',
      courseCode: item.courseCode,
      subjectHours: item.subjectHours,
      weeklyHoursTotal: item.weeklyHoursTotal,
      unavailableSlotIds: item.unavailableSlotIds,
    })),
    relationships: [],
    options: { timeLimitSeconds: 10, randomSeed: 1 },
  };
  const schedule = withClass(emptySchedule([generalSciences], defaultSlots), {
    id: 'class-1',
    teacherId: generalSciences.id,
    slotId: 'slot-monday-1600',
    studentIds: students.map((item) => ({
      id: item.id,
      name: item.displayName,
    })),
  });
  const { evaluation, internalScore } = evaluateSchedule(
    schedule,
    { students, teachers: [generalSciences] },
    { purpose: 'DRAFT_VALIDATION', evaluatedAt: '2026-08-28T10:00:00.000Z' },
  );

  it('accepts matching versions, lexicographic scores and rule occurrence counts', () => {
    expect(
      detectSolverDivergence({
        request,
        response: responseFor(request, {
          findings: [],
          score: {
            direction: 'MINIMIZE',
            bestScore: 0,
            tiers: internalScore.lexicographic.map((penalty, index) => ({
              priority: index + 1,
              penalty,
            })),
            ruleBreakdown: [],
          },
        }),
        evaluation,
        internalScore,
      }),
    ).toBeNull();
  });

  it('detects score and finding-count disagreements', () => {
    const mismatched = detectSolverDivergence({
      request,
      response: responseFor(request, {
        findings: [],
        score: {
          direction: 'MINIMIZE',
          bestScore: 0,
          tiers: [1, 2, 3, 4, 5, 6].map((priority) => ({
            priority,
            penalty: priority === 3 ? 9 : 0,
          })),
          ruleBreakdown: [],
        },
      }),
      evaluation,
      internalScore,
    });
    expect(mismatched).toMatch(/priority 3 penalty/);

    const extraFinding = detectSolverDivergence({
      request,
      response: responseFor(request, {
        findings: [
          {
            fingerprint:
              'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            ruleId: 'CLASS_CAPACITY_MINIMUM',
            enforcement: 'RELAXABLE',
            severity: 'ERROR',
            blocksConfirmation: false,
            entityRefs: [{ type: 'CLASS', id: 'class-1' }],
            slotIds: ['slot-monday-1600'],
            parameters: {},
          },
        ],
        score: {
          direction: 'MINIMIZE',
          bestScore: 0,
          tiers: internalScore.lexicographic.map((penalty, index) => ({
            priority: index + 1,
            penalty,
          })),
          ruleBreakdown: [],
        },
      }),
      evaluation,
      internalScore,
    });
    expect(extraFinding).toMatch(/CLASS_CAPACITY_MINIMUM/);
  });

  it('detects incomplete hour coverage on a generated draft', () => {
    expect(incompleteGeneratedHours(schedule, students)).toBeNull();
    expect(
      incompleteGeneratedHours(emptySchedule([generalSciences], defaultSlots), [
        student({ id: 'student-1', weeklyHoursTotal: 2 }),
      ]),
    ).toMatch(/student-1 was assigned 0 hours instead of 2/);
  });
});

function responseFor(
  request: SolveScheduleRequest,
  solution: Pick<SolverSolution, 'score' | 'findings'>,
): SolveScheduleResponse {
  return {
    contractVersion: request.contractVersion,
    ruleCatalogVersion: request.ruleCatalogVersion,
    requestId: request.requestId,
    mode: 'STRICT',
    status: 'OPTIMAL',
    attempts: [{ mode: 'STRICT', status: 'OPTIMAL', elapsedMilliseconds: 1 }],
    solution: {
      classes: [
        {
          id: 'class-1',
          teacherId: generalSciences.id,
          slotId: 'slot-monday-1600',
          studentIds: request.students.map((item) => item.id),
        },
      ],
      subjectTeacherAllocations: [],
      ...solution,
    },
    elapsedMilliseconds: 1,
    randomSeed: request.options.randomSeed,
    timeLimitSeconds: request.options.timeLimitSeconds,
  };
}
