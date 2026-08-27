import fc from 'fast-check';
import { evaluateSchedule } from './schedule-validator';
import {
  context,
  emptySchedule,
  generalSciences,
  languages,
  monday1600,
  monday1700,
  student,
  tuesday1600,
  withClass,
} from './schedule-validator.fixtures';
import type { ValidationStudent } from './validation-context';

const slotIds = [monday1600.id, monday1700.id, tuesday1600.id];

describe('evaluateSchedule properties', () => {
  it('validating twice yields the same fingerprints, outcome and score', () => {
    fc.assert(
      fc.property(scheduleArb(), (sample) => {
        const first = evaluateSchedule(sample.schedule, sample.context, {
          purpose: 'DRAFT_VALIDATION',
          evaluatedAt: '2026-08-27T12:00:00.000Z',
          evaluationId: 'same',
        });
        const second = evaluateSchedule(sample.schedule, sample.context, {
          purpose: 'DRAFT_VALIDATION',
          evaluatedAt: '2026-08-27T12:00:00.000Z',
          evaluationId: 'same',
        });
        expect(first.evaluation).toEqual(second.evaluation);
        expect(first.internalScore).toEqual(second.internalScore);
      }),
      { numRuns: 25 },
    );
  });

  it('reordering classes and assignments does not change functional validity', () => {
    fc.assert(
      fc.property(scheduleArb(), fc.nat(), (sample, seed) => {
        const shuffled = {
          ...sample.schedule,
          classes: rotate(
            sample.schedule.classes.map((weeklyClass) => ({
              ...weeklyClass,
              assignments: rotate(weeklyClass.assignments, seed + 1),
            })),
            seed,
          ),
        };
        const original = evaluateSchedule(sample.schedule, sample.context, {
          purpose: 'DRAFT_VALIDATION',
          evaluatedAt: '2026-08-27T12:00:00.000Z',
          evaluationId: 'same',
        });
        const reordered = evaluateSchedule(shuffled, sample.context, {
          purpose: 'DRAFT_VALIDATION',
          evaluatedAt: '2026-08-27T12:00:00.000Z',
          evaluationId: 'same',
        });
        expect(original.evaluation.outcome).toBe(reordered.evaluation.outcome);
        expect(original.evaluation.validationFingerprint).toBe(
          reordered.evaluation.validationFingerprint,
        );
        expect(original.internalScore.lexicographic).toEqual(
          reordered.internalScore.lexicographic,
        );
      }),
      { numRuns: 25 },
    );
  });

  it('every overlap between two teachers in the same slot is detected', () => {
    fc.assert(
      fc.property(studentArb('shared'), (person) => {
        const schedule = withClass(
          withClass(emptySchedule(), {
            id: 'class-a',
            teacherId: generalSciences.id,
            slotId: monday1600.id,
            studentIds: [{ id: person.id, name: person.displayName }],
          }),
          {
            id: 'class-b',
            teacherId: languages.id,
            slotId: monday1600.id,
            studentIds: [{ id: person.id, name: person.displayName }],
          },
        );
        const result = evaluateSchedule(
          schedule,
          context({ students: [person] }),
          {
            purpose: 'DRAFT_VALIDATION',
          },
        );
        expect(
          result.evaluation.findings.some(
            (item) => item.ruleId === 'STUDENT_TIME_OVERLAP',
          ),
        ).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  it('every finding references entities and slots that exist in the schedule', () => {
    fc.assert(
      fc.property(scheduleArb(), (sample) => {
        const result = evaluateSchedule(sample.schedule, sample.context, {
          purpose: 'DRAFT_VALIDATION',
        });
        const classIds = new Set(
          sample.schedule.classes.map((item) => item.id),
        );
        const teacherIds = new Set(
          sample.schedule.teachers.map((item) => item.id),
        );
        const slotIdsInSchedule = new Set(
          sample.schedule.slots.map((item) => item.id),
        );
        const assignmentIds = new Set(
          sample.schedule.classes.flatMap((weeklyClass) =>
            weeklyClass.assignments.map((assignment) => assignment.id),
          ),
        );
        const studentIds = new Set([
          ...sample.context.students.map((item) => item.id),
          ...sample.schedule.classes.flatMap((weeklyClass) =>
            weeklyClass.assignments.map((assignment) => assignment.studentId),
          ),
        ]);
        for (const item of result.evaluation.findings) {
          expect(item.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
          for (const slotId of item.slotIds) {
            expect(slotIdsInSchedule.has(slotId)).toBe(true);
          }
          for (const reference of item.entityRefs) {
            if (reference.type === 'SCHEDULE') {
              expect(reference.id).toBe(sample.schedule.id);
            }
            if (reference.type === 'CLASS') {
              expect(classIds.has(reference.id)).toBe(true);
            }
            if (reference.type === 'TEACHER') {
              expect(teacherIds.has(reference.id)).toBe(true);
            }
            if (reference.type === 'SLOT') {
              expect(slotIdsInSchedule.has(reference.id)).toBe(true);
            }
            if (reference.type === 'ASSIGNMENT') {
              expect(assignmentIds.has(reference.id)).toBe(true);
            }
            if (reference.type === 'STUDENT') {
              expect(studentIds.has(reference.id)).toBe(true);
            }
          }
        }
      }),
      { numRuns: 25 },
    );
  });

  it('adding a student to a class already at maximum does not improve the score', () => {
    const seated = Array.from({ length: 5 }, (_, index) =>
      student({ id: `full-${index}`, displayName: `Alumno ${index}` }),
    );
    fc.assert(
      fc.property(studentArb('extra'), (extra) => {
        const full = withClass(emptySchedule(), {
          id: 'class-full',
          teacherId: generalSciences.id,
          slotId: monday1600.id,
          studentIds: seated.map((item) => ({
            id: item.id,
            name: item.displayName,
          })),
        });
        const overflow = {
          ...full,
          classes: [
            {
              ...full.classes[0],
              assignments: [
                ...full.classes[0].assignments,
                {
                  id: `extra-${extra.id}`,
                  studentId: extra.id,
                  studentDisplayName: extra.displayName,
                },
              ],
            },
          ],
        };
        const before = evaluateSchedule(full, context({ students: seated }), {
          purpose: 'DRAFT_VALIDATION',
        });
        const after = evaluateSchedule(
          overflow,
          context({ students: [...seated, extra] }),
          { purpose: 'DRAFT_VALIDATION' },
        );
        expect(
          compareLexicographic(
            after.internalScore.lexicographic,
            before.internalScore.lexicographic,
          ),
        ).toBeGreaterThan(0);
        expect(after.internalScore.byPriority[1]).toBeGreaterThan(
          before.internalScore.byPriority[1],
        );
      }),
      { numRuns: 15 },
    );
  });
});

function scheduleArb() {
  return fc
    .array(studentArb(), { minLength: 1, maxLength: 5 })
    .chain((students) =>
      fc.tuple(
        fc.constant(students),
        fc.array(classPlanArb(students), { minLength: 0, maxLength: 4 }),
      ),
    )
    .map(([students, plans]) => {
      let schedule = emptySchedule();
      plans.forEach((plan, index) => {
        schedule = withClass(schedule, {
          id: `class-${index}`,
          teacherId: plan.teacherId,
          slotId: plan.slotId,
          studentIds: plan.studentIds.map((id) => {
            const person = students.find((item) => item.id === id)!;
            return { id, name: person.displayName };
          }),
        });
      });
      return {
        schedule,
        context: context({ students }),
      };
    });
}

function classPlanArb(students: ValidationStudent[]) {
  return fc.record({
    teacherId: fc.constantFrom(generalSciences.id, languages.id),
    slotId: fc.constantFrom(...slotIds),
    studentIds: fc.subarray(
      students.map((item) => item.id),
      { minLength: 1, maxLength: Math.min(4, students.length) },
    ),
  });
}

function studentArb(prefix = 's') {
  return fc.integer({ min: 1, max: 9_999 }).map((serial) =>
    student({
      id: `${prefix}-${serial}`,
      displayName: `Alumno ${serial}`,
      weeklyHoursTotal: 1 + (serial % 3),
      subjectHours: [
        { subjectCode: 'MATHEMATICS', weeklyHours: 1 + (serial % 3) },
      ],
    }),
  );
}

function rotate<T>(items: T[], seed: number): T[] {
  if (items.length === 0) {
    return [];
  }
  const offset = seed % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function compareLexicographic(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}
