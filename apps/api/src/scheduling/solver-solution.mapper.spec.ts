import { ProblemDetailsException } from '../http/problem-details.exception';
import { toDraftClasses } from './solver-solution.mapper';
import type { SolverSolution } from './solver-contract';

describe('toDraftClasses', () => {
  const solution: SolverSolution = {
    classes: [
      {
        id: 'class-1',
        teacherId: 'teacher-1',
        slotId: 'slot-monday-1600',
        studentIds: ['student-1', 'student-2'],
      },
    ],
    subjectTeacherAllocations: [
      {
        studentId: 'student-1',
        teacherId: 'teacher-1',
        totalHours: 1,
        subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 1 }],
      },
    ],
    score: {
      direction: 'MINIMIZE',
      bestScore: 0,
      tiers: [1, 2, 3, 4, 5, 6].map((priority) => ({
        priority,
        penalty: 0,
      })),
      ruleBreakdown: [],
    },
    findings: [],
  };

  it('copies solver classes into draft assignments with display names', () => {
    let nextId = 0;
    const mapped = toDraftClasses(
      solution,
      new Map([
        ['student-1', { displayName: 'Ana Ruiz' }],
        ['student-2', { displayName: 'Luis Pérez' }],
      ]),
      () => `assignment-${(nextId += 1)}`,
    );

    expect(mapped.classes).toEqual([
      {
        id: 'class-1',
        teacherId: 'teacher-1',
        slotId: 'slot-monday-1600',
        findingFingerprints: [],
        assignments: [
          {
            id: 'assignment-1',
            studentId: 'student-1',
            studentDisplayName: 'Ana Ruiz',
          },
          {
            id: 'assignment-2',
            studentId: 'student-2',
            studentDisplayName: 'Luis Pérez',
          },
        ],
      },
    ]);
    expect(mapped.subjectTeacherAllocations).toEqual(
      solution.subjectTeacherAllocations,
    );
  });

  it('rejects assignments for unknown students', () => {
    try {
      toDraftClasses(solution, new Map());
      throw new Error('Expected the mapper to reject unknown students');
    } catch (error) {
      expect(error).toBeInstanceOf(ProblemDetailsException);
      expect((error as ProblemDetailsException).problem).toMatchObject({
        status: 502,
        code: 'SOLVER_INVALID_RESPONSE',
      });
    }
  });
});
