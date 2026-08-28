import {
  addAssignment,
  attachEvaluation,
  classesForTeacher,
  confirmSchedule,
  countStudentAssignments,
  createDraftFromConfirmed,
  createEmptyDraft,
  moveAssignment,
  removeAssignment,
  setSubjectTeacherAllocations,
  withCatalogSlots,
} from './schedule-aggregate';
import type {
  Schedule,
  ScheduleEvaluation,
  ScheduleSlot,
  ScheduleTeacher,
} from './schedule';
import {
  ScheduleConfirmationError,
  ScheduleIntegrityError,
  ScheduleNotMutableError,
  ScheduleRevisionConflictError,
} from './schedule-errors';

const monday1600: ScheduleSlot = {
  id: 'slot-monday-1600',
  dayOfWeek: 'MONDAY',
  startTime: '16:00',
  endTime: '17:00',
};
const monday1700: ScheduleSlot = {
  id: 'slot-monday-1700',
  dayOfWeek: 'MONDAY',
  startTime: '17:00',
  endTime: '18:00',
};
const teachers: ScheduleTeacher[] = [
  { id: 'teacher-1', displayName: 'Profesor Uno', profile: 'GENERAL_SCIENCES' },
  { id: 'teacher-2', displayName: 'Profesor Dos', profile: 'SENIOR_SCIENCES' },
];

describe('Schedule aggregate', () => {
  it('creates an empty global weekly draft with teacher and slot snapshots', () => {
    const schedule = emptyDraft();

    expect(schedule).toMatchObject({
      state: 'DRAFT',
      revision: 0,
      isCurrent: false,
      sourceScheduleId: null,
      confirmedAt: null,
      classes: [],
      evaluation: null,
    });
    expect(schedule.teachers).toHaveLength(2);
    expect(schedule.slots.map((slot) => slot.id)).toEqual([
      'slot-monday-1600',
      'slot-monday-1700',
    ]);
    expect(classesForTeacher(schedule, 'teacher-1')).toEqual([]);
  });

  it('adds missing catalog hours to a draft without replacing existing slots', () => {
    const schedule = emptyDraft();
    const lateSlot: ScheduleSlot = {
      id: 'slot-monday-2000',
      dayOfWeek: 'MONDAY',
      startTime: '20:00',
      endTime: '21:00',
    };

    const { schedule: merged, added } = withCatalogSlots(schedule, [
      monday1600,
      lateSlot,
    ]);

    expect(added).toEqual([lateSlot]);
    expect(merged.slots.map((slot) => slot.id)).toEqual([
      'slot-monday-1600',
      'slot-monday-1700',
      'slot-monday-2000',
    ]);
    expect(withCatalogSlots(merged, [monday1600, lateSlot]).added).toEqual([]);
  });

  it('rejects snapshots that are empty, duplicated or not one hour long', () => {
    expect(() =>
      createEmptyDraft({
        id: 'schedule-1',
        createdAt: now,
        teachers: [],
        slots: [monday1600],
      }),
    ).toThrow(ScheduleIntegrityError);
    expect(() =>
      createEmptyDraft({
        id: 'schedule-1',
        createdAt: now,
        teachers,
        slots: [{ ...monday1600, endTime: '16:45' }],
      }),
    ).toThrow(/sixty minutes/);
  });

  it('adds a one-hour class assignment and counts remaining student hours', () => {
    const schedule = addAssignment(
      emptyDraft(),
      activeStudent(),
      ids('a1', 'c1'),
    );

    expect(schedule.revision).toBe(1);
    expect(schedule.classes).toHaveLength(1);
    expect(schedule.classes[0]).toMatchObject({
      teacherId: 'teacher-1',
      slotId: 'slot-monday-1600',
    });
    expect(countStudentAssignments(schedule, 'student-1')).toBe(1);
  });

  it('reuses the class of a teacher and slot instead of creating a second one', () => {
    const first = addAssignment(emptyDraft(), activeStudent(), ids('a1', 'c1'));
    const second = addAssignment(
      first,
      { ...activeStudent('student-2', 'Luis García'), expectedRevision: 1 },
      ids('a2', 'c2'),
    );

    expect(second.classes).toHaveLength(1);
    expect(second.classes[0].id).toBe('c1');
    expect(second.classes[0].assignments).toHaveLength(2);
  });

  it('rejects waiting-list students, hour overflow, duplicates and time overlap', () => {
    expect(() =>
      addAssignment(
        emptyDraft(),
        { ...activeStudent(), studentStatus: 'WAITING_LIST' },
        ids('a1', 'c1'),
      ),
    ).toThrow(/active students/);

    const firstHour = addAssignment(
      emptyDraft(),
      activeStudent(),
      ids('a1', 'c1'),
    );
    const secondHour = addAssignment(
      firstHour,
      { ...activeStudent(), expectedRevision: 1, slotId: 'slot-monday-1700' },
      ids('a2', 'c2'),
    );
    expect(() =>
      addAssignment(
        secondHour,
        { ...activeStudent(), expectedRevision: 2, weeklyHoursTotal: 2 },
        ids('a3', 'c3'),
      ),
    ).toThrow(/more hours than the student has contracted/);

    expect(() =>
      addAssignment(
        firstHour,
        { ...activeStudent(), expectedRevision: 1 },
        ids('a2', 'c2'),
      ),
    ).toThrow(/twice in the same class/);

    expect(() =>
      addAssignment(
        firstHour,
        {
          ...activeStudent(),
          expectedRevision: 1,
          teacherId: 'teacher-2',
        },
        ids('a2', 'c2'),
      ),
    ).toThrow(/two classes in the same slot/);
  });

  it('moves an assignment atomically without changing the student hour count', () => {
    const origin = addAssignment(
      emptyDraft(),
      activeStudent(),
      ids('a1', 'c1'),
    );
    const moved = moveAssignment(
      origin,
      {
        expectedRevision: 1,
        assignmentId: 'a1',
        targetTeacherId: 'teacher-2',
        targetSlotId: 'slot-monday-1700',
      },
      ids('a1', 'c2', '2026-08-26T10:01:00.000Z'),
    );

    expect(countStudentAssignments(moved, 'student-1')).toBe(1);
    expect(classesForTeacher(moved, 'teacher-1')).toEqual([]);
    expect(moved.classes[0]).toMatchObject({
      id: 'c2',
      teacherId: 'teacher-2',
      slotId: 'slot-monday-1700',
    });
    expect(moved.evaluation).toBeNull();
  });

  it('removes an assignment and drops the empty class', () => {
    const origin = addAssignment(
      emptyDraft(),
      activeStudent(),
      ids('a1', 'c1'),
    );
    const next = removeAssignment(
      origin,
      { expectedRevision: 1, assignmentId: 'a1' },
      now,
    );

    expect(next.classes).toEqual([]);
    expect(countStudentAssignments(next, 'student-1')).toBe(0);
  });

  it('stores explicit subject-teacher allocations when several teachers serve a student', () => {
    const twoTeachers = assignedToBothTeachers();
    const next = setSubjectTeacherAllocations(
      twoTeachers,
      {
        expectedRevision: twoTeachers.revision,
        studentId: 'student-1',
        allocations: [
          allocation('teacher-1', 'MATHEMATICS', 1),
          allocation('teacher-2', 'PHYSICS', 1),
        ],
      },
      now,
    );

    expect(next.subjectTeacherAllocations).toHaveLength(2);
    expect(() =>
      setSubjectTeacherAllocations(
        twoTeachers,
        {
          expectedRevision: twoTeachers.revision,
          studentId: 'student-1',
          allocations: [
            allocation('teacher-1', 'MATHEMATICS', 2),
            allocation('teacher-2', 'PHYSICS', 1),
          ],
        },
        now,
      ),
    ).toThrow(/match the student classes/);
  });

  it('refuses mutations against a stale revision or a confirmed schedule', () => {
    const draft = addAssignment(emptyDraft(), activeStudent(), ids('a1', 'c1'));
    expect(() =>
      addAssignment(
        draft,
        { ...activeStudent('student-2'), expectedRevision: 0 },
        ids('a2', 'c2'),
      ),
    ).toThrow(ScheduleRevisionConflictError);

    const evaluated = withIdealEvaluation(draft);
    const confirmed = confirmSchedule(evaluated, confirmCommand(evaluated));
    expect(confirmed.state).toBe('CONFIRMED');
    expect(confirmed.isCurrent).toBe(true);
    expect(() =>
      addAssignment(
        confirmed,
        { ...activeStudent('student-2'), expectedRevision: confirmed.revision },
        ids('a2', 'c2'),
      ),
    ).toThrow(ScheduleNotMutableError);
  });

  it('confirms a draft together with the accepted validation evidence', () => {
    const draft = addAssignment(emptyDraft(), activeStudent(), ids('a1', 'c1'));
    const evaluated = attachEvaluation(
      draft,
      evaluationWithCapacityWarning(draft, draft.classes[0].id),
      draft.revision,
    );
    expect(evaluated.classes[0].findingFingerprints).toEqual([
      relaxableFingerprint,
      preferenceFingerprint,
    ]);

    expect(() =>
      confirmSchedule(evaluated, {
        ...confirmCommand(evaluated),
        acceptRelaxableConflicts: false,
      }),
    ).toThrow(ScheduleConfirmationError);

    const confirmed = confirmSchedule(evaluated, confirmCommand(evaluated));
    expect(confirmed).toMatchObject({
      state: 'CONFIRMED',
      isCurrent: true,
      confirmedByUserId: 'user-1',
      revision: evaluated.revision,
    });
    expect(confirmed.acceptedFindingFingerprints).toEqual([
      relaxableFingerprint,
    ]);
    expect(confirmed.evaluation?.outcome).toBe('HAS_RELAXABLE_CONFLICTS');
  });

  it('blocks confirmation when hard findings are present or the fingerprint is stale', () => {
    const draft = addAssignment(emptyDraft(), activeStudent(), ids('a1', 'c1'));
    const blocked = attachEvaluation(
      draft,
      blockedEvaluation(draft),
      draft.revision,
    );
    expect(() => confirmSchedule(blocked, confirmCommand(blocked))).toThrow(
      /Hard findings/,
    );

    const valid = attachEvaluation(
      draft,
      idealEvaluation(draft),
      draft.revision,
    );
    expect(() =>
      confirmSchedule(valid, {
        ...confirmCommand(valid),
        validationFingerprint: otherFingerprint,
      }),
    ).toThrow(/current validation fingerprint/);
  });

  it('creates a new draft revision from a confirmed schedule without mutating the source', () => {
    const evaluated = withIdealEvaluation(
      addAssignment(emptyDraft(), activeStudent(), ids('a1', 'c1')),
    );
    const confirmed = confirmSchedule(evaluated, confirmCommand(evaluated));
    const sourceSnapshot = JSON.stringify(confirmed);
    let serial = 0;
    const draft = createDraftFromConfirmed(confirmed, {
      id: 'schedule-2',
      createdAt: '2026-08-26T11:00:00.000Z',
      identity: () => `copy-${++serial}`,
    });

    expect(draft).toMatchObject({
      id: 'schedule-2',
      state: 'DRAFT',
      revision: 0,
      isCurrent: false,
      sourceScheduleId: confirmed.id,
      confirmedAt: null,
      evaluation: null,
    });
    expect(draft.classes[0].id).not.toBe(confirmed.classes[0].id);
    expect(draft.classes[0].assignments[0].studentId).toBe('student-1');
    expect(JSON.parse(sourceSnapshot)).toEqual(confirmed);
    expect(() =>
      createDraftFromConfirmed(emptyDraft(), {
        id: 'schedule-2',
        createdAt: now,
        identity: () => 'x',
      }),
    ).toThrow(/confirmed schedule/);
  });
});

const now = '2026-08-26T10:00:00.000Z';
const relaxableFingerprint = fingerprint('1');
const preferenceFingerprint = fingerprint('2');
const otherFingerprint = fingerprint('9');

function emptyDraft(): Schedule {
  return createEmptyDraft({
    id: 'schedule-1',
    createdAt: now,
    teachers,
    slots: [monday1600, monday1700],
  });
}

function activeStudent(
  studentId = 'student-1',
  name = 'Ana Ruiz',
): AddAssignmentDefaults {
  return {
    expectedRevision: 0,
    studentId,
    studentDisplayName: name,
    studentStatus: 'ACTIVE',
    weeklyHoursTotal: 2,
    teacherId: 'teacher-1',
    slotId: 'slot-monday-1600',
  };
}

type AddAssignmentDefaults = Parameters<typeof addAssignment>[1];

function ids(assignmentId: string, classId: string, updatedAt = now) {
  return { assignmentId, classId, updatedAt };
}

function assignedToBothTeachers(): Schedule {
  const first = addAssignment(emptyDraft(), activeStudent(), ids('a1', 'c1'));
  return addAssignment(
    first,
    {
      ...activeStudent(),
      expectedRevision: 1,
      teacherId: 'teacher-2',
      slotId: 'slot-monday-1700',
    },
    ids('a2', 'c2'),
  );
}

function allocation(
  teacherId: string,
  subjectCode: 'MATHEMATICS' | 'PHYSICS',
  weeklyHours: number,
) {
  return {
    studentId: 'student-1',
    teacherId,
    subjectHours: [{ subjectCode, weeklyHours }],
    totalHours: weeklyHours,
  };
}

function confirmCommand(schedule: Schedule) {
  return {
    expectedRevision: schedule.revision,
    validationFingerprint:
      schedule.evaluation?.validationFingerprint ?? fingerprint('4'),
    acceptRelaxableConflicts: true,
    userId: 'user-1',
    confirmedAt: '2026-08-26T10:05:00.000Z',
  };
}

function withIdealEvaluation(schedule: Schedule): Schedule {
  return attachEvaluation(
    schedule,
    idealEvaluation(schedule),
    schedule.revision,
  );
}

function idealEvaluation(schedule: Schedule): ScheduleEvaluation {
  return {
    id: 'validation-ideal',
    validationFingerprint: fingerprint('4'),
    scheduleId: schedule.id,
    scheduleRevision: schedule.revision,
    ruleCatalogVersion: schedule.ruleCatalogVersion,
    evaluatedAt: now,
    outcome: 'IDEAL',
    canConfirm: true,
    counts: {
      blockingErrors: 0,
      relaxableErrors: 0,
      warnings: 0,
      information: 0,
    },
    findings: [],
  };
}

function evaluationWithCapacityWarning(
  schedule: Schedule,
  classId: string,
): ScheduleEvaluation {
  return {
    id: 'validation-relaxed',
    validationFingerprint: fingerprint('4'),
    scheduleId: schedule.id,
    scheduleRevision: schedule.revision,
    ruleCatalogVersion: schedule.ruleCatalogVersion,
    evaluatedAt: now,
    outcome: 'HAS_RELAXABLE_CONFLICTS',
    canConfirm: true,
    counts: {
      blockingErrors: 0,
      relaxableErrors: 1,
      warnings: 1,
      information: 0,
    },
    findings: [
      {
        fingerprint: relaxableFingerprint,
        ruleId: 'CLASS_CAPACITY_MINIMUM',
        enforcement: 'RELAXABLE',
        severity: 'ERROR',
        blocksConfirmation: false,
        entityRefs: [{ type: 'CLASS', id: classId }],
        slotIds: ['slot-monday-1600'],
        parameters: { actualCapacity: 1, minimumCapacity: 3 },
        message: 'La clase tiene menos alumnos que el mínimo recomendado.',
      },
      {
        fingerprint: preferenceFingerprint,
        ruleId: 'CLASS_CAPACITY_IDEAL',
        enforcement: 'PREFERENCE',
        severity: 'WARNING',
        blocksConfirmation: false,
        entityRefs: [{ type: 'CLASS', id: classId }],
        slotIds: ['slot-monday-1600'],
        parameters: { actualCapacity: 1, idealCapacity: 4 },
        message: 'La clase no alcanza la capacidad ideal.',
      },
    ],
  };
}

function blockedEvaluation(schedule: Schedule): ScheduleEvaluation {
  return {
    ...idealEvaluation(schedule),
    id: 'validation-blocked',
    validationFingerprint: fingerprint('5'),
    outcome: 'BLOCKED',
    canConfirm: false,
    counts: {
      blockingErrors: 1,
      relaxableErrors: 0,
      warnings: 0,
      information: 0,
    },
    findings: [
      {
        fingerprint: fingerprint('8'),
        ruleId: 'STUDENT_TIME_OVERLAP',
        enforcement: 'HARD',
        severity: 'ERROR',
        blocksConfirmation: true,
        entityRefs: [{ type: 'STUDENT', id: 'student-1' }],
        slotIds: ['slot-monday-1600'],
        parameters: {},
        message: 'El alumno tiene dos clases a la misma hora.',
      },
    ],
  };
}

function fingerprint(digit: string): string {
  return `sha256:${digit.repeat(64)}`;
}
