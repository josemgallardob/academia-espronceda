import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateSchedule } from './schedule-validator';
import {
  assign,
  context,
  defaultSlots,
  emptySchedule,
  generalSciences,
  languages,
  monday1600,
  monday1900,
  seniorSciences,
  student,
  withAllocations,
  withClass,
} from './schedule-validator.fixtures';
import { RULE_DEFINITIONS } from './validation-context';

const catalog = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../contracts/rules/1.0.0/catalog.json'),
    'utf8',
  ),
) as { rules: Array<{ id: string; enforcement: string; severity: string }> };

describe('evaluateSchedule', () => {
  it('returns IDEAL for an empty draft during construction', () => {
    const result = evaluateSchedule(
      emptySchedule(),
      context({
        students: [
          student({ id: 'ana', weeklyHoursTotal: 2, displayName: 'Ana' }),
        ],
      }),
      { purpose: 'DRAFT_VALIDATION', evaluatedAt: '2026-08-27T10:00:00.000Z' },
    );

    expect(result.evaluation).toMatchObject({
      outcome: 'IDEAL',
      canConfirm: true,
      findings: [],
      counts: {
        blockingErrors: 0,
        relaxableErrors: 0,
        warnings: 0,
        information: 0,
      },
    });
    expect(result.internalScore.lexicographic).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('blocks confirmation when an active student is still under-assigned', () => {
    const ana = student({
      id: 'ana',
      displayName: 'Ana Pérez',
      weeklyHoursTotal: 2,
      subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 2 }],
    });
    const result = evaluateSchedule(
      emptySchedule(),
      context({ students: [ana] }),
      {
        purpose: 'CONFIRMATION',
      },
    );

    expect(result.evaluation.outcome).toBe('BLOCKED');
    expect(result.evaluation.canConfirm).toBe(false);
    expect(result.evaluation.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'STUDENT_WEEKLY_HOURS_EXACT',
          blocksConfirmation: true,
          parameters: {
            weeklyHoursTotal: 2,
            assignedHours: 0,
            remainingHours: 2,
          },
        }),
      ]),
    );
  });

  it('does not emit under-assignment while a draft is being built', () => {
    const ana = student({ id: 'ana', weeklyHoursTotal: 2 });
    const result = evaluateSchedule(
      emptySchedule(),
      context({ students: [ana] }),
      {
        purpose: 'DRAFT_VALIDATION',
      },
    );

    expect(result.evaluation.findings.map((item) => item.ruleId)).not.toContain(
      'STUDENT_WEEKLY_HOURS_EXACT',
    );
  });

  it('detects waiting-list and unknown students', () => {
    const waiting = student({
      id: 'waiting',
      displayName: 'Luis García',
      status: 'WAITING_LIST',
    });
    const schedule = withClass(emptySchedule(), {
      id: 'class-1',
      teacherId: generalSciences.id,
      slotId: monday1600.id,
      studentIds: [
        { id: waiting.id, name: waiting.displayName },
        { id: 'ghost', name: 'Fantasma' },
      ],
    });

    const result = evaluateSchedule(
      schedule,
      context({ students: [waiting] }),
      {
        purpose: 'DRAFT_VALIDATION',
      },
    );

    expect(findingsOf(result, 'ACTIVE_STUDENTS_ONLY')).toHaveLength(2);
    expect(result.evaluation.outcome).toBe('BLOCKED');
  });

  it('detects invalid class slots', () => {
    const schedule = emptySchedule();
    schedule.slots[0] = { ...monday1600, endTime: '16:45' };
    const ana = student({ id: 'ana' });
    const invalid = withClass(schedule, {
      id: 'class-1',
      teacherId: generalSciences.id,
      slotId: monday1600.id,
      studentIds: [{ id: ana.id, name: ana.displayName }],
    });

    const result = evaluateSchedule(invalid, context({ students: [ana] }), {
      purpose: 'DRAFT_VALIDATION',
    });

    expect(findingsOf(result, 'CLASS_SLOT_VALID')).toHaveLength(1);
  });

  it('detects two classes of the same teacher in one slot', () => {
    const ana = student({ id: 'ana' });
    const luis = student({ id: 'luis', displayName: 'Luis' });
    let schedule = emptySchedule();
    schedule = withClass(schedule, {
      id: 'class-a',
      teacherId: generalSciences.id,
      slotId: monday1600.id,
      studentIds: [{ id: ana.id, name: ana.displayName }],
    });
    schedule = withClass(schedule, {
      id: 'class-b',
      teacherId: generalSciences.id,
      slotId: monday1600.id,
      studentIds: [{ id: luis.id, name: luis.displayName }],
    });

    const result = evaluateSchedule(
      schedule,
      context({ students: [ana, luis] }),
      {
        purpose: 'DRAFT_VALIDATION',
      },
    );

    expect(findingsOf(result, 'TEACHER_SINGLE_CLASS_PER_SLOT')).toHaveLength(1);
  });

  it('detects a duplicated student inside a class', () => {
    const ana = student({ id: 'ana' });
    const schedule = withClass(emptySchedule(), {
      id: 'class-1',
      teacherId: generalSciences.id,
      slotId: monday1600.id,
      studentIds: [
        { id: ana.id, name: ana.displayName, assignmentId: 'a1' },
        { id: ana.id, name: ana.displayName, assignmentId: 'a2' },
      ],
    });

    const result = evaluateSchedule(schedule, context({ students: [ana] }), {
      purpose: 'DRAFT_VALIDATION',
    });

    expect(findingsOf(result, 'STUDENT_UNIQUE_IN_CLASS')).toHaveLength(1);
  });

  it('detects student overlaps including same-slot classes with different teachers', () => {
    const ana = student({
      id: 'ana',
      weeklyHoursTotal: 2,
      subjectHours: [
        { subjectCode: 'MATHEMATICS', weeklyHours: 1 },
        { subjectCode: 'ENGLISH', weeklyHours: 1 },
      ],
    });
    let schedule = emptySchedule();
    schedule = withClass(schedule, {
      id: 'class-math',
      teacherId: generalSciences.id,
      slotId: monday1600.id,
      studentIds: [{ id: ana.id, name: ana.displayName }],
    });
    schedule = withClass(schedule, {
      id: 'class-english',
      teacherId: languages.id,
      slotId: monday1600.id,
      studentIds: [{ id: ana.id, name: ana.displayName }],
    });

    const result = evaluateSchedule(schedule, context({ students: [ana] }), {
      purpose: 'DRAFT_VALIDATION',
    });

    expect(findingsOf(result, 'STUDENT_TIME_OVERLAP')[0]).toMatchObject({
      ruleId: 'STUDENT_TIME_OVERLAP',
      blocksConfirmation: true,
    });
    expect(findingsOf(result, 'STUDENT_TIME_OVERLAP')[0].message).toContain(
      'clases solapadas',
    );
  });

  it('does not treat adjacent one-hour slots as an overlap', () => {
    const ana = student({
      id: 'ana',
      weeklyHoursTotal: 2,
      subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 2 }],
    });
    let schedule = emptySchedule();
    schedule = assign(schedule, {
      student: ana,
      teacherId: generalSciences.id,
      slotId: 'slot-monday-1600',
      suffix: '1',
    });
    schedule = assign(schedule, {
      student: ana,
      teacherId: generalSciences.id,
      slotId: 'slot-monday-1700',
      suffix: '2',
    });

    const result = evaluateSchedule(schedule, context({ students: [ana] }), {
      purpose: 'CONFIRMATION',
    });

    expect(findingsOf(result, 'STUDENT_TIME_OVERLAP')).toHaveLength(0);
    expect(findingsOf(result, 'STUDENT_SAME_DAY_CONTIGUOUS')).toHaveLength(0);
  });

  it('blocks same-day classes that leave a gap between slots', () => {
    const ana = student({
      id: 'ana',
      weeklyHoursTotal: 2,
      subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 2 }],
    });
    const teacher = {
      ...generalSciences,
      availableSlotIds: [...generalSciences.availableSlotIds, monday1900.id],
    };
    let schedule = emptySchedule(
      [teacher, languages],
      [...defaultSlots, monday1900],
    );
    schedule = assign(schedule, {
      student: ana,
      teacherId: teacher.id,
      slotId: 'slot-monday-1700',
      suffix: '1',
    });
    schedule = assign(schedule, {
      student: ana,
      teacherId: teacher.id,
      slotId: 'slot-monday-1900',
      suffix: '2',
    });

    const result = evaluateSchedule(
      schedule,
      context({ students: [ana], teachers: [teacher, languages] }),
      {
        purpose: 'CONFIRMATION',
      },
    );

    expect(findingsOf(result, 'STUDENT_SAME_DAY_CONTIGUOUS')[0]).toMatchObject({
      ruleId: 'STUDENT_SAME_DAY_CONTIGUOUS',
      blocksConfirmation: true,
    });
    expect(
      findingsOf(result, 'STUDENT_SAME_DAY_CONTIGUOUS')[0].message,
    ).toContain('no son consecutivas');
    expect(result.evaluation.canConfirm).toBe(false);
  });

  it('prefers spreading hours across days when two classes share a weekday', () => {
    const ana = student({
      id: 'ana',
      weeklyHoursTotal: 2,
      subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 2 }],
    });
    let schedule = emptySchedule();
    schedule = assign(schedule, {
      student: ana,
      teacherId: generalSciences.id,
      slotId: 'slot-monday-1600',
      suffix: '1',
    });
    schedule = assign(schedule, {
      student: ana,
      teacherId: generalSciences.id,
      slotId: 'slot-monday-1700',
      suffix: '2',
    });

    const result = evaluateSchedule(schedule, context({ students: [ana] }), {
      purpose: 'CONFIRMATION',
    });

    expect(findingsOf(result, 'STUDENT_DAY_SPREAD')[0]).toMatchObject({
      ruleId: 'STUDENT_DAY_SPREAD',
      enforcement: 'PREFERENCE',
      blocksConfirmation: false,
    });
    expect(result.internalScore.byPriority[4]).toBe(1);
  });

  it('detects subject and course incompatibility', () => {
    const ana = student({
      id: 'ana',
      courseCode: 'BACH_2',
      subjectHours: [{ subjectCode: 'ENGLISH', weeklyHours: 1 }],
    });
    const schedule = assign(emptySchedule(), {
      student: ana,
      teacherId: generalSciences.id,
      slotId: monday1600.id,
      suffix: '1',
    });

    const result = evaluateSchedule(schedule, context({ students: [ana] }), {
      purpose: 'DRAFT_VALIDATION',
    });

    expect(findingsOf(result, 'TEACHER_SUBJECT_COMPATIBILITY')).toHaveLength(1);
    expect(findingsOf(result, 'TEACHER_COURSE_COMPATIBILITY')).toHaveLength(1);
  });

  it('detects teacher and student unavailability', () => {
    const busyTeacher = {
      ...generalSciences,
      availableSlotIds: ['slot-monday-1700'],
    };
    const ana = student({
      id: 'ana',
      unavailableSlotIds: [monday1600.id],
    });
    const schedule = assign(emptySchedule([busyTeacher, languages]), {
      student: ana,
      teacherId: busyTeacher.id,
      slotId: monday1600.id,
      suffix: '1',
    });

    const result = evaluateSchedule(
      schedule,
      context({ students: [ana], teachers: [busyTeacher, languages] }),
      { purpose: 'DRAFT_VALIDATION' },
    );

    expect(findingsOf(result, 'TEACHER_AVAILABILITY')).toHaveLength(1);
    expect(findingsOf(result, 'STUDENT_AVAILABILITY')).toHaveLength(1);
  });

  it('detects over-assigned weekly hours even in a draft', () => {
    const ana = student({ id: 'ana', weeklyHoursTotal: 1 });
    let schedule = emptySchedule();
    schedule = assign(schedule, {
      student: ana,
      teacherId: generalSciences.id,
      slotId: 'slot-monday-1600',
      suffix: '1',
    });
    schedule = assign(schedule, {
      student: ana,
      teacherId: generalSciences.id,
      slotId: 'slot-monday-1700',
      suffix: '2',
    });

    const result = evaluateSchedule(schedule, context({ students: [ana] }), {
      purpose: 'DRAFT_VALIDATION',
    });

    expect(
      findingsOf(result, 'STUDENT_WEEKLY_HOURS_EXACT')[0].parameters,
    ).toMatchObject({
      assignedHours: 2,
      weeklyHoursTotal: 1,
      remainingHours: -1,
    });
  });

  it('requires exact subject-hour allocations when several teachers serve a student', () => {
    const ana = student({
      id: 'ana',
      weeklyHoursTotal: 2,
      subjectHours: [
        { subjectCode: 'MATHEMATICS', weeklyHours: 1 },
        { subjectCode: 'ENGLISH', weeklyHours: 1 },
      ],
    });
    let schedule = emptySchedule();
    schedule = assign(schedule, {
      student: ana,
      teacherId: generalSciences.id,
      slotId: 'slot-monday-1600',
      suffix: 'math',
    });
    schedule = assign(schedule, {
      student: ana,
      teacherId: languages.id,
      slotId: 'slot-monday-1700',
      suffix: 'english',
    });

    const missing = evaluateSchedule(schedule, context({ students: [ana] }), {
      purpose: 'DRAFT_VALIDATION',
    });
    expect(
      findingsOf(missing, 'STUDENT_SUBJECT_HOURS_EXACT').length,
    ).toBeGreaterThan(0);

    const allocated = withAllocations(schedule, [
      {
        studentId: ana.id,
        teacherId: generalSciences.id,
        totalHours: 1,
        subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 1 }],
      },
      {
        studentId: ana.id,
        teacherId: languages.id,
        totalHours: 1,
        subjectHours: [{ subjectCode: 'ENGLISH', weeklyHours: 1 }],
      },
    ]);
    const valid = evaluateSchedule(allocated, context({ students: [ana] }), {
      purpose: 'CONFIRMATION',
    });
    expect(findingsOf(valid, 'STUDENT_SUBJECT_HOURS_EXACT')).toHaveLength(0);
    expect(findingsOf(valid, 'SUBJECT_SINGLE_TEACHER')).toHaveLength(0);
  });

  it('detects a subject split across two teachers', () => {
    const ana = student({
      id: 'ana',
      weeklyHoursTotal: 2,
      subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 2 }],
    });
    let schedule = emptySchedule([generalSciences, seniorSciences]);
    schedule = assign(schedule, {
      student: ana,
      teacherId: generalSciences.id,
      slotId: 'slot-monday-1600',
      suffix: '1',
    });
    schedule = assign(schedule, {
      student: ana,
      teacherId: seniorSciences.id,
      slotId: 'slot-monday-1700',
      suffix: '2',
    });
    schedule = withAllocations(schedule, [
      {
        studentId: ana.id,
        teacherId: generalSciences.id,
        totalHours: 1,
        subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 1 }],
      },
      {
        studentId: ana.id,
        teacherId: seniorSciences.id,
        totalHours: 1,
        subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 1 }],
      },
    ]);

    const result = evaluateSchedule(
      schedule,
      context({ students: [ana], teachers: [generalSciences, seniorSciences] }),
      { purpose: 'CONFIRMATION' },
    );

    expect(findingsOf(result, 'SUBJECT_SINGLE_TEACHER')).toHaveLength(1);
  });

  it('classifies capacity findings and scores them lexicographically', () => {
    const students = Array.from({ length: 6 }, (_, index) =>
      student({
        id: `s${index}`,
        displayName: `Alumno ${index}`,
        weeklyHoursTotal: 1,
      }),
    );
    const crowded = withClass(emptySchedule(), {
      id: 'class-full',
      teacherId: generalSciences.id,
      slotId: monday1600.id,
      studentIds: students.map((item) => ({
        id: item.id,
        name: item.displayName,
      })),
    });
    const small = withClass(emptySchedule(), {
      id: 'class-small',
      teacherId: generalSciences.id,
      slotId: monday1600.id,
      studentIds: students.slice(0, 2).map((item) => ({
        id: item.id,
        name: item.displayName,
      })),
    });

    const crowdedResult = evaluateSchedule(crowded, context({ students }), {
      purpose: 'DRAFT_VALIDATION',
    });
    const smallResult = evaluateSchedule(
      small,
      context({ students: students.slice(0, 2) }),
      {
        purpose: 'DRAFT_VALIDATION',
      },
    );

    expect(crowdedResult.evaluation.outcome).toBe('HAS_RELAXABLE_CONFLICTS');
    expect(crowdedResult.evaluation.canConfirm).toBe(true);
    expect(
      findingsOf(crowdedResult, 'CLASS_CAPACITY_MAXIMUM')[0],
    ).toMatchObject({
      enforcement: 'RELAXABLE',
      blocksConfirmation: false,
      parameters: { actualCapacity: 6, maximumCapacity: 5 },
    });
    expect(crowdedResult.internalScore.byPriority[1]).toBe(1);
    expect(crowdedResult.internalScore.byPriority[3]).toBe(4);

    expect(smallResult.evaluation.outcome).toBe('HAS_RELAXABLE_CONFLICTS');
    expect(
      findingsOf(smallResult, 'CLASS_CAPACITY_MINIMUM')[0].message,
    ).toContain('mínimo recomendado es 3');
    expect(smallResult.internalScore.byPriority[2]).toBe(1);
    expect(smallResult.internalScore.lexicographic[0]).toBeLessThan(
      crowdedResult.internalScore.lexicographic[0],
    );
  });

  it('blocks a student split across more teachers than needed', () => {
    const ana = student({
      id: 'ana',
      weeklyHoursTotal: 2,
      subjectHours: [
        { subjectCode: 'MATHEMATICS', weeklyHours: 1 },
        { subjectCode: 'PHYSICS', weeklyHours: 1 },
      ],
    });
    let schedule = emptySchedule([generalSciences, seniorSciences]);
    schedule = assign(schedule, {
      student: ana,
      teacherId: generalSciences.id,
      slotId: 'slot-monday-1600',
      suffix: '1',
    });
    schedule = assign(schedule, {
      student: ana,
      teacherId: seniorSciences.id,
      slotId: 'slot-monday-1700',
      suffix: '2',
    });
    schedule = withAllocations(schedule, [
      {
        studentId: ana.id,
        teacherId: generalSciences.id,
        totalHours: 1,
        subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 1 }],
      },
      {
        studentId: ana.id,
        teacherId: seniorSciences.id,
        totalHours: 1,
        subjectHours: [{ subjectCode: 'PHYSICS', weeklyHours: 1 }],
      },
    ]);

    const result = evaluateSchedule(
      schedule,
      context({ students: [ana], teachers: [generalSciences, seniorSciences] }),
      { purpose: 'CONFIRMATION' },
    );

    expect(findingsOf(result, 'STUDENT_TEACHER_CONTINUITY')[0]).toMatchObject({
      enforcement: 'HARD',
      blocksConfirmation: true,
      parameters: { minimumRequiredTeachers: 1 },
    });
    expect(result.evaluation.outcome).toBe('BLOCKED');
    expect(result.evaluation.canConfirm).toBe(false);
  });

  it('detects related students who could share more feasible classes', () => {
    const ana = student({
      id: 'ana',
      displayName: 'Ana',
      relatedPersonIds: ['luis'],
      weeklyHoursTotal: 1,
    });
    const luis = student({
      id: 'luis',
      displayName: 'Luis',
      relatedPersonIds: ['ana'],
      weeklyHoursTotal: 1,
    });
    let schedule = emptySchedule();
    schedule = assign(schedule, {
      student: ana,
      teacherId: generalSciences.id,
      slotId: 'slot-monday-1600',
      suffix: 'ana',
    });
    schedule = assign(schedule, {
      student: luis,
      teacherId: generalSciences.id,
      slotId: 'slot-monday-1700',
      suffix: 'luis',
    });

    const result = evaluateSchedule(
      schedule,
      context({ students: [ana, luis] }),
      {
        purpose: 'DRAFT_VALIDATION',
      },
    );

    expect(
      findingsOf(result, 'RELATED_STUDENTS_TOGETHER')[0].parameters,
    ).toMatchObject({
      sharedSessionTarget: 1,
      sharedClassIds: [],
    });
  });

  it('prefers GENERAL_SCIENCES for Bach 1 and SENIOR_SCIENCES for OTHER', () => {
    const bach = student({
      id: 'bach',
      displayName: 'Marta',
      courseCode: 'BACH_1',
      subjectHours: [{ subjectCode: 'PHYSICS', weeklyHours: 1 }],
    });
    const other = student({
      id: 'other',
      displayName: 'Pablo',
      courseCode: 'OTHER',
      subjectHours: [{ subjectCode: 'PHYSICS', weeklyHours: 1 }],
    });
    let bachSchedule = emptySchedule([generalSciences, seniorSciences]);
    bachSchedule = assign(bachSchedule, {
      student: bach,
      teacherId: seniorSciences.id,
      slotId: monday1600.id,
      suffix: 'bach',
    });
    const generalWithOther = {
      ...generalSciences,
      courseCodes: [...generalSciences.courseCodes, 'OTHER' as const],
    };
    let otherSchedule = emptySchedule([generalWithOther, seniorSciences]);
    otherSchedule = assign(otherSchedule, {
      student: other,
      teacherId: generalWithOther.id,
      slotId: monday1600.id,
      suffix: 'other',
    });

    const teachers = [generalSciences, seniorSciences];
    const bachResult = evaluateSchedule(
      bachSchedule,
      context({ students: [bach], teachers }),
      { purpose: 'DRAFT_VALIDATION' },
    );
    const otherResult = evaluateSchedule(
      otherSchedule,
      context({
        students: [other],
        teachers: [generalWithOther, seniorSciences],
      }),
      { purpose: 'DRAFT_VALIDATION' },
    );

    expect(
      findingsOf(bachResult, 'PREFERRED_TEACHER_BACH1_SCIENCES'),
    ).toHaveLength(1);
    expect(
      findingsOf(otherResult, 'PREFERRED_TEACHER_OTHER_SCIENCES'),
    ).toHaveLength(1);
  });

  it('is deterministic and ignores input ordering', () => {
    const students = [
      student({ id: 'ana', displayName: 'Ana' }),
      student({ id: 'luis', displayName: 'Luis' }),
    ];
    const schedule = withClass(emptySchedule(), {
      id: 'class-1',
      teacherId: generalSciences.id,
      slotId: monday1600.id,
      studentIds: students.map((item) => ({
        id: item.id,
        name: item.displayName,
      })),
    });
    const reversed = {
      ...schedule,
      classes: schedule.classes.map((weeklyClass) => ({
        ...weeklyClass,
        assignments: [...weeklyClass.assignments].reverse(),
      })),
    };

    const first = evaluateSchedule(schedule, context({ students }), {
      purpose: 'DRAFT_VALIDATION',
      evaluatedAt: '2026-08-27T10:00:00.000Z',
      evaluationId: 'fixed',
    });
    const second = evaluateSchedule(schedule, context({ students }), {
      purpose: 'DRAFT_VALIDATION',
      evaluatedAt: '2026-08-27T10:00:00.000Z',
      evaluationId: 'fixed',
    });
    const shuffled = evaluateSchedule(
      reversed,
      context({ students: [...students].reverse() }),
      {
        purpose: 'DRAFT_VALIDATION',
        evaluatedAt: '2026-08-27T10:00:00.000Z',
        evaluationId: 'fixed',
      },
    );

    expect(first.evaluation).toEqual(second.evaluation);
    expect(first.evaluation.findings.map((item) => item.fingerprint)).toEqual(
      shuffled.evaluation.findings.map((item) => item.fingerprint),
    );
    expect(first.evaluation.validationFingerprint).toEqual(
      shuffled.evaluation.validationFingerprint,
    );
  });

  it('writes Spanish explanations and SHA-256 fingerprints', () => {
    const ana = student({ id: 'ana', displayName: 'Ana Pérez' });
    const schedule = withClass(emptySchedule(), {
      id: 'class-1',
      teacherId: generalSciences.id,
      slotId: monday1600.id,
      studentIds: [{ id: ana.id, name: ana.displayName }],
    });
    const result = evaluateSchedule(schedule, context({ students: [ana] }), {
      purpose: 'DRAFT_VALIDATION',
    });

    expect(result.evaluation.validationFingerprint).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
    for (const item of result.evaluation.findings) {
      expect(item.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(item.message.length).toBeGreaterThan(10);
      expect(item.message).toMatch(/[áéíóúñÁÉÍÓÚÑa-zA-Z]/);
    }
  });

  it('covers every published catalog rule identifier', () => {
    const implemented = new Set(Object.keys(RULE_DEFINITIONS));
    expect([...implemented].sort()).toEqual(
      catalog.rules.map((rule) => rule.id).sort(),
    );
    for (const rule of catalog.rules) {
      expect(
        RULE_DEFINITIONS[rule.id as keyof typeof RULE_DEFINITIONS],
      ).toMatchObject({
        enforcement: rule.enforcement,
        severity: rule.severity,
      });
    }
  });
});

function findingsOf(
  result: ReturnType<typeof evaluateSchedule>,
  ruleId: string,
) {
  return result.evaluation.findings.filter((item) => item.ruleId === ruleId);
}
