import {
  CURRENT_RULE_CATALOG_VERSION,
  FINGERPRINT_PATTERN,
  type AddAssignmentCommand,
  type ConfirmScheduleCommand,
  type MoveAssignmentCommand,
  type NewIdentity,
  type RemoveAssignmentCommand,
  type Schedule,
  type ScheduleEvaluation,
  type ScheduleSlot,
  type ScheduleTeacher,
  type SetAllocationsCommand,
  type WeeklyClass,
} from './schedule';
import {
  ScheduleConfirmationError,
  ScheduleIntegrityError,
  ScheduleNotMutableError,
  ScheduleRevisionConflictError,
} from './schedule-errors';

export function createEmptyDraft(input: {
  id: string;
  createdAt: string;
  ruleCatalogVersion?: string;
  teachers: ScheduleTeacher[];
  slots: ScheduleSlot[];
}): Schedule {
  if (input.teachers.length === 0) {
    throw new ScheduleIntegrityError(
      'A schedule requires at least one teacher',
    );
  }
  if (input.slots.length === 0) {
    throw new ScheduleIntegrityError(
      'A schedule requires at least one weekly slot',
    );
  }
  assertUniqueIds(
    input.teachers.map((teacher) => teacher.id),
    'Duplicate teacher snapshot',
  );
  assertUniqueIds(
    input.slots.map((slot) => slot.id),
    'Duplicate slot snapshot',
  );
  for (const slot of input.slots) {
    if (!isSixtyMinuteSlot(slot.startTime, slot.endTime)) {
      throw new ScheduleIntegrityError(
        `Slot ${slot.id} must last exactly sixty minutes`,
      );
    }
  }

  const schedule: Schedule = {
    id: input.id,
    state: 'DRAFT',
    revision: 0,
    isCurrent: false,
    sourceScheduleId: null,
    ruleCatalogVersion:
      input.ruleCatalogVersion ?? CURRENT_RULE_CATALOG_VERSION,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    confirmedAt: null,
    confirmedByUserId: null,
    teachers: cloneTeachers(input.teachers),
    slots: cloneSlots(input.slots),
    classes: [],
    subjectTeacherAllocations: [],
    evaluation: null,
    acceptedFindingFingerprints: [],
  };
  assertScheduleIntegrity(schedule);
  return schedule;
}

export function withCatalogSlots(
  schedule: Schedule,
  catalogSlots: ScheduleSlot[],
): { schedule: Schedule; added: ScheduleSlot[] } {
  const existingIds = new Set(schedule.slots.map((slot) => slot.id));
  const added = catalogSlots.filter((slot) => !existingIds.has(slot.id));
  if (added.length === 0) {
    return { schedule, added };
  }
  return {
    schedule: {
      ...schedule,
      slots: [...cloneSlots(schedule.slots), ...cloneSlots(added)],
    },
    added: cloneSlots(added),
  };
}

export function createDraftFromConfirmed(
  source: Schedule,
  input: {
    id: string;
    createdAt: string;
    identity: (kind: 'class' | 'assignment') => string;
  },
): Schedule {
  if (source.state !== 'CONFIRMED') {
    throw new ScheduleIntegrityError(
      'A revision draft can only be created from a confirmed schedule',
    );
  }

  const classes = source.classes.map((weeklyClass) => ({
    ...weeklyClass,
    id: input.identity('class'),
    assignments: weeklyClass.assignments.map((assignment) => ({
      ...assignment,
      id: input.identity('assignment'),
    })),
    findingFingerprints: [],
  }));

  const schedule: Schedule = {
    id: input.id,
    state: 'DRAFT',
    revision: 0,
    isCurrent: false,
    sourceScheduleId: source.id,
    ruleCatalogVersion: source.ruleCatalogVersion,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    confirmedAt: null,
    confirmedByUserId: null,
    teachers: cloneTeachers(source.teachers),
    slots: cloneSlots(source.slots),
    classes,
    subjectTeacherAllocations: source.subjectTeacherAllocations.map(
      (allocation) => ({
        ...allocation,
        subjectHours: allocation.subjectHours.map((hours) => ({ ...hours })),
      }),
    ),
    evaluation: null,
    acceptedFindingFingerprints: [],
  };
  assertScheduleIntegrity(schedule);
  return schedule;
}

export function addAssignment(
  schedule: Schedule,
  command: AddAssignmentCommand,
  identity: NewIdentity,
): Schedule {
  assertDraftMutation(schedule, command.expectedRevision);
  assertTeacherAndSlot(schedule, command.teacherId, command.slotId);
  if (command.studentStatus !== 'ACTIVE') {
    throw new ScheduleIntegrityError(
      'Only active students can receive assignments',
    );
  }
  if (!command.studentDisplayName.trim()) {
    throw new ScheduleIntegrityError('Assignment display name cannot be blank');
  }

  const assignedHours = countStudentAssignments(schedule, command.studentId);
  if (assignedHours + 1 > command.weeklyHoursTotal) {
    throw new ScheduleIntegrityError(
      'A draft cannot assign more hours than the student has contracted',
    );
  }

  const next = mutateDraft(schedule, identity.updatedAt, (draft) => {
    const weeklyClass = ensureClass(
      draft,
      command.teacherId,
      command.slotId,
      identity.classId,
    );
    if (
      weeklyClass.assignments.some(
        (assignment) => assignment.studentId === command.studentId,
      )
    ) {
      throw new ScheduleIntegrityError(
        'A student cannot appear twice in the same class',
      );
    }
    if (studentOccupiesSlot(draft, command.studentId, command.slotId)) {
      throw new ScheduleIntegrityError(
        'A student cannot occupy two classes in the same slot',
      );
    }
    weeklyClass.assignments.push({
      id: identity.assignmentId,
      studentId: command.studentId,
      studentDisplayName: command.studentDisplayName.trim(),
    });
  });
  assertScheduleIntegrity(next);
  return next;
}

export function removeAssignment(
  schedule: Schedule,
  command: RemoveAssignmentCommand,
  updatedAt: string,
): Schedule {
  assertDraftMutation(schedule, command.expectedRevision);
  const next = mutateDraft(schedule, updatedAt, (draft) => {
    const located = locateAssignment(draft, command.assignmentId);
    if (!located) {
      throw new ScheduleIntegrityError(
        `Assignment ${command.assignmentId} was not found`,
      );
    }
    located.weeklyClass.assignments = located.weeklyClass.assignments.filter(
      (assignment) => assignment.id !== command.assignmentId,
    );
    dropEmptyClass(draft, located.weeklyClass.id);
  });
  assertScheduleIntegrity(next);
  return next;
}

export function moveAssignment(
  schedule: Schedule,
  command: MoveAssignmentCommand,
  identity: NewIdentity,
): Schedule {
  assertDraftMutation(schedule, command.expectedRevision);
  assertTeacherAndSlot(schedule, command.targetTeacherId, command.targetSlotId);

  const located = locateAssignment(schedule, command.assignmentId);
  if (!located) {
    throw new ScheduleIntegrityError(
      `Assignment ${command.assignmentId} was not found`,
    );
  }
  if (
    located.weeklyClass.teacherId === command.targetTeacherId &&
    located.weeklyClass.slotId === command.targetSlotId
  ) {
    throw new ScheduleIntegrityError(
      'The assignment already occupies the requested class',
    );
  }

  const hoursBefore = countStudentAssignments(
    schedule,
    located.assignment.studentId,
  );
  const next = mutateDraft(schedule, identity.updatedAt, (draft) => {
    const current = locateAssignment(draft, command.assignmentId);
    if (!current) {
      throw new ScheduleIntegrityError(
        `Assignment ${command.assignmentId} was not found`,
      );
    }
    const { assignment, weeklyClass } = current;
    weeklyClass.assignments = weeklyClass.assignments.filter(
      (candidate) => candidate.id !== assignment.id,
    );
    dropEmptyClass(draft, weeklyClass.id);

    if (
      studentOccupiesSlot(draft, assignment.studentId, command.targetSlotId)
    ) {
      throw new ScheduleIntegrityError(
        'A student cannot occupy two classes in the same slot',
      );
    }
    const target = ensureClass(
      draft,
      command.targetTeacherId,
      command.targetSlotId,
      identity.classId,
    );
    if (
      target.assignments.some(
        (candidate) => candidate.studentId === assignment.studentId,
      )
    ) {
      throw new ScheduleIntegrityError(
        'A student cannot appear twice in the same class',
      );
    }
    target.assignments.push({ ...assignment });
  });

  const hoursAfter = countStudentAssignments(
    next,
    located.assignment.studentId,
  );
  if (hoursBefore !== hoursAfter) {
    throw new ScheduleIntegrityError(
      'Moving an assignment must preserve the student hour count',
    );
  }
  assertScheduleIntegrity(next);
  return next;
}

export function setSubjectTeacherAllocations(
  schedule: Schedule,
  command: SetAllocationsCommand,
  updatedAt: string,
): Schedule {
  assertDraftMutation(schedule, command.expectedRevision);
  if (command.allocations.length < 2) {
    throw new ScheduleIntegrityError(
      'Explicit subject-teacher allocations are only used when several teachers serve the student',
    );
  }
  for (const allocation of command.allocations) {
    if (allocation.studentId !== command.studentId) {
      throw new ScheduleIntegrityError(
        'Allocations must belong to the requested student',
      );
    }
    assertTeacherExists(schedule, allocation.teacherId);
    const hours = allocation.subjectHours.reduce(
      (total, item) => total + item.weeklyHours,
      0,
    );
    if (
      allocation.subjectHours.length === 0 ||
      hours !== allocation.totalHours
    ) {
      throw new ScheduleIntegrityError(
        'Allocation hours must match the declared total for that teacher',
      );
    }
    const assignedWithTeacher = countStudentAssignmentsWithTeacher(
      schedule,
      command.studentId,
      allocation.teacherId,
    );
    if (assignedWithTeacher !== allocation.totalHours) {
      throw new ScheduleIntegrityError(
        'Allocated hours per teacher must match the student classes with that teacher',
      );
    }
  }

  const subjectCodes = command.allocations.flatMap((allocation) =>
    allocation.subjectHours.map((item) => item.subjectCode),
  );
  assertUniqueIds(
    subjectCodes,
    'Each subject must be allocated to a single teacher',
  );

  const next = mutateDraft(schedule, updatedAt, (draft) => {
    draft.subjectTeacherAllocations = [
      ...draft.subjectTeacherAllocations.filter(
        (allocation) => allocation.studentId !== command.studentId,
      ),
      ...command.allocations.map((allocation) => ({
        ...allocation,
        subjectHours: allocation.subjectHours.map((hours) => ({ ...hours })),
      })),
    ];
  });
  assertScheduleIntegrity(next);
  return next;
}

export function attachEvaluation(
  schedule: Schedule,
  evaluation: ScheduleEvaluation,
  expectedRevision: number,
): Schedule {
  if (schedule.revision !== expectedRevision) {
    throw new ScheduleRevisionConflictError();
  }
  if (evaluation.scheduleId !== schedule.id) {
    throw new ScheduleIntegrityError(
      'Evaluation does not belong to this schedule',
    );
  }
  if (evaluation.scheduleRevision !== schedule.revision) {
    throw new ScheduleIntegrityError(
      'Evaluation revision does not match the schedule',
    );
  }
  if (!FINGERPRINT_PATTERN.test(evaluation.validationFingerprint)) {
    throw new ScheduleIntegrityError('Validation fingerprint is malformed');
  }
  for (const finding of evaluation.findings) {
    if (!FINGERPRINT_PATTERN.test(finding.fingerprint)) {
      throw new ScheduleIntegrityError('Finding fingerprint is malformed');
    }
    if (!finding.message.trim()) {
      throw new ScheduleIntegrityError('Finding message cannot be blank');
    }
  }

  const next: Schedule = {
    ...cloneSchedule(schedule),
    evaluation: {
      ...evaluation,
      findings: evaluation.findings.map((finding) => ({
        ...finding,
        entityRefs: finding.entityRefs.map((reference) => ({ ...reference })),
        slotIds: [...finding.slotIds],
        parameters: { ...finding.parameters },
      })),
    },
    classes: annotateClassFindings(schedule.classes, evaluation),
  };
  assertScheduleIntegrity(next);
  return next;
}

export function confirmSchedule(
  schedule: Schedule,
  command: ConfirmScheduleCommand,
): Schedule {
  if (schedule.state !== 'DRAFT') {
    throw new ScheduleNotMutableError('Only a draft schedule can be confirmed');
  }
  if (schedule.revision !== command.expectedRevision) {
    throw new ScheduleRevisionConflictError();
  }
  if (!schedule.evaluation) {
    throw new ScheduleConfirmationError(
      'Confirmation requires a persisted validation result',
    );
  }
  if (
    schedule.evaluation.validationFingerprint !== command.validationFingerprint
  ) {
    throw new ScheduleConfirmationError(
      'Confirmation requires the current validation fingerprint',
    );
  }
  if (schedule.evaluation.scheduleRevision !== schedule.revision) {
    throw new ScheduleConfirmationError(
      'Confirmation requires a validation of the current revision',
    );
  }
  if (
    !schedule.evaluation.canConfirm ||
    schedule.evaluation.counts.blockingErrors > 0 ||
    schedule.evaluation.findings.some((finding) => finding.blocksConfirmation)
  ) {
    throw new ScheduleConfirmationError(
      'Hard findings always block confirmation',
    );
  }

  const relaxableFingerprints = schedule.evaluation.findings
    .filter((finding) => finding.enforcement === 'RELAXABLE')
    .map((finding) => finding.fingerprint);
  if (relaxableFingerprints.length > 0 && !command.acceptRelaxableConflicts) {
    throw new ScheduleConfirmationError(
      'Relaxable conflicts require explicit acceptance before confirmation',
    );
  }

  const next: Schedule = {
    ...cloneSchedule(schedule),
    state: 'CONFIRMED',
    isCurrent: true,
    updatedAt: command.confirmedAt,
    confirmedAt: command.confirmedAt,
    confirmedByUserId: command.userId,
    acceptedFindingFingerprints: command.acceptRelaxableConflicts
      ? relaxableFingerprints
      : [],
    classes: annotateClassFindings(schedule.classes, schedule.evaluation),
  };
  assertScheduleIntegrity(next);
  return next;
}

export function classesForTeacher(
  schedule: Schedule,
  teacherId: string,
): WeeklyClass[] {
  return schedule.classes.filter(
    (weeklyClass) => weeklyClass.teacherId === teacherId,
  );
}

export function countStudentAssignments(
  schedule: Schedule,
  studentId: string,
): number {
  return schedule.classes.reduce(
    (total, weeklyClass) =>
      total +
      weeklyClass.assignments.filter(
        (assignment) => assignment.studentId === studentId,
      ).length,
    0,
  );
}

export function assertScheduleIntegrity(schedule: Schedule): void {
  if (schedule.isCurrent && schedule.state !== 'CONFIRMED') {
    throw new ScheduleIntegrityError(
      'Only a confirmed schedule can be current',
    );
  }
  if (schedule.state === 'CONFIRMED') {
    if (!schedule.confirmedAt || !schedule.confirmedByUserId) {
      throw new ScheduleIntegrityError(
        'A confirmed schedule must record who confirmed it and when',
      );
    }
    if (!schedule.evaluation) {
      throw new ScheduleIntegrityError(
        'A confirmed schedule must keep the accepted validation',
      );
    }
  }
  if (schedule.revision < 0) {
    throw new ScheduleIntegrityError('Revision cannot be negative');
  }

  assertUniqueIds(
    schedule.teachers.map((teacher) => teacher.id),
    'Duplicate teacher snapshot',
  );
  assertUniqueIds(
    schedule.slots.map((slot) => slot.id),
    'Duplicate slot snapshot',
  );
  assertUniqueIds(
    schedule.classes.map((weeklyClass) => weeklyClass.id),
    'Duplicate class identifier',
  );

  const teacherSlotKeys = new Set<string>();
  const studentSlotKeys = new Set<string>();
  const assignmentIds = new Set<string>();
  for (const weeklyClass of schedule.classes) {
    assertTeacherExists(schedule, weeklyClass.teacherId);
    assertSlotExists(schedule, weeklyClass.slotId);
    const teacherSlotKey = `${weeklyClass.teacherId}:${weeklyClass.slotId}`;
    if (teacherSlotKeys.has(teacherSlotKey)) {
      throw new ScheduleIntegrityError(
        'A teacher can have at most one class per slot',
      );
    }
    teacherSlotKeys.add(teacherSlotKey);

    const studentIds = new Set<string>();
    for (const assignment of weeklyClass.assignments) {
      if (assignmentIds.has(assignment.id)) {
        throw new ScheduleIntegrityError('Duplicate assignment identifier');
      }
      assignmentIds.add(assignment.id);
      if (studentIds.has(assignment.studentId)) {
        throw new ScheduleIntegrityError(
          'A student cannot appear twice in the same class',
        );
      }
      studentIds.add(assignment.studentId);
      const studentSlotKey = `${assignment.studentId}:${weeklyClass.slotId}`;
      if (studentSlotKeys.has(studentSlotKey)) {
        throw new ScheduleIntegrityError(
          'A student cannot occupy two classes in the same slot',
        );
      }
      studentSlotKeys.add(studentSlotKey);
      if (!assignment.studentDisplayName.trim()) {
        throw new ScheduleIntegrityError(
          'Assignment display name cannot be blank',
        );
      }
    }
  }

  const allocatedSubjects = new Set<string>();
  for (const allocation of schedule.subjectTeacherAllocations) {
    assertTeacherExists(schedule, allocation.teacherId);
    const hours = allocation.subjectHours.reduce(
      (total, item) => total + item.weeklyHours,
      0,
    );
    if (hours !== allocation.totalHours) {
      throw new ScheduleIntegrityError(
        'Allocation totals must equal the subject hours',
      );
    }
    for (const item of allocation.subjectHours) {
      const key = `${allocation.studentId}:${item.subjectCode}`;
      if (allocatedSubjects.has(key)) {
        throw new ScheduleIntegrityError(
          'Each subject must belong to a single teacher',
        );
      }
      allocatedSubjects.add(key);
    }
  }
}

function mutateDraft(
  schedule: Schedule,
  updatedAt: string,
  mutate: (draft: Schedule) => void,
): Schedule {
  const draft = cloneSchedule(schedule);
  mutate(draft);
  draft.revision = schedule.revision + 1;
  draft.updatedAt = updatedAt;
  draft.evaluation = null;
  draft.acceptedFindingFingerprints = [];
  draft.classes = draft.classes.map((weeklyClass) => ({
    ...weeklyClass,
    findingFingerprints: [],
  }));
  return draft;
}

function assertDraftMutation(
  schedule: Schedule,
  expectedRevision: number,
): void {
  if (schedule.state !== 'DRAFT') {
    throw new ScheduleNotMutableError();
  }
  if (schedule.revision !== expectedRevision) {
    throw new ScheduleRevisionConflictError();
  }
}

function assertTeacherAndSlot(
  schedule: Schedule,
  teacherId: string,
  slotId: string,
): void {
  assertTeacherExists(schedule, teacherId);
  assertSlotExists(schedule, slotId);
}

function assertTeacherExists(schedule: Schedule, teacherId: string): void {
  if (!schedule.teachers.some((teacher) => teacher.id === teacherId)) {
    throw new ScheduleIntegrityError(
      `Teacher ${teacherId} is not part of this schedule`,
    );
  }
}

function assertSlotExists(schedule: Schedule, slotId: string): void {
  if (!schedule.slots.some((slot) => slot.id === slotId)) {
    throw new ScheduleIntegrityError(
      `Slot ${slotId} is not part of this schedule`,
    );
  }
}

function ensureClass(
  schedule: Schedule,
  teacherId: string,
  slotId: string,
  classId: string,
): WeeklyClass {
  const existing = schedule.classes.find(
    (weeklyClass) =>
      weeklyClass.teacherId === teacherId && weeklyClass.slotId === slotId,
  );
  if (existing) {
    return existing;
  }
  const created: WeeklyClass = {
    id: classId,
    teacherId,
    slotId,
    assignments: [],
    findingFingerprints: [],
  };
  schedule.classes.push(created);
  return created;
}

function dropEmptyClass(schedule: Schedule, classId: string): void {
  schedule.classes = schedule.classes.filter(
    (weeklyClass) =>
      weeklyClass.id !== classId || weeklyClass.assignments.length > 0,
  );
}

function locateAssignment(
  schedule: Schedule,
  assignmentId: string,
):
  | { weeklyClass: WeeklyClass; assignment: WeeklyClass['assignments'][number] }
  | undefined {
  for (const weeklyClass of schedule.classes) {
    const assignment = weeklyClass.assignments.find(
      (candidate) => candidate.id === assignmentId,
    );
    if (assignment) {
      return { weeklyClass, assignment };
    }
  }
  return undefined;
}

function studentOccupiesSlot(
  schedule: Schedule,
  studentId: string,
  slotId: string,
): boolean {
  return schedule.classes.some(
    (weeklyClass) =>
      weeklyClass.slotId === slotId &&
      weeklyClass.assignments.some(
        (assignment) => assignment.studentId === studentId,
      ),
  );
}

function countStudentAssignmentsWithTeacher(
  schedule: Schedule,
  studentId: string,
  teacherId: string,
): number {
  return schedule.classes.reduce((total, weeklyClass) => {
    if (weeklyClass.teacherId !== teacherId) {
      return total;
    }
    return (
      total +
      weeklyClass.assignments.filter(
        (assignment) => assignment.studentId === studentId,
      ).length
    );
  }, 0);
}

function annotateClassFindings(
  classes: WeeklyClass[],
  evaluation: ScheduleEvaluation | null,
): WeeklyClass[] {
  return classes.map((weeklyClass) => ({
    ...weeklyClass,
    assignments: weeklyClass.assignments.map((assignment) => ({
      ...assignment,
    })),
    findingFingerprints: evaluation
      ? [
          ...new Set(
            evaluation.findings
              .filter((finding) =>
                finding.entityRefs.some(
                  (reference) =>
                    reference.type === 'CLASS' &&
                    reference.id === weeklyClass.id,
                ),
              )
              .map((finding) => finding.fingerprint),
          ),
        ]
      : [],
  }));
}

function cloneSchedule(schedule: Schedule): Schedule {
  return {
    ...schedule,
    teachers: cloneTeachers(schedule.teachers),
    slots: cloneSlots(schedule.slots),
    classes: schedule.classes.map((weeklyClass) => ({
      ...weeklyClass,
      assignments: weeklyClass.assignments.map((assignment) => ({
        ...assignment,
      })),
      findingFingerprints: [...weeklyClass.findingFingerprints],
    })),
    subjectTeacherAllocations: schedule.subjectTeacherAllocations.map(
      (allocation) => ({
        ...allocation,
        subjectHours: allocation.subjectHours.map((hours) => ({ ...hours })),
      }),
    ),
    acceptedFindingFingerprints: [...schedule.acceptedFindingFingerprints],
    evaluation: schedule.evaluation
      ? {
          ...schedule.evaluation,
          counts: { ...schedule.evaluation.counts },
          findings: schedule.evaluation.findings.map((finding) => ({
            ...finding,
            entityRefs: finding.entityRefs.map((reference) => ({
              ...reference,
            })),
            slotIds: [...finding.slotIds],
            parameters: { ...finding.parameters },
          })),
        }
      : null,
  };
}

function cloneTeachers(teachers: ScheduleTeacher[]): ScheduleTeacher[] {
  return teachers.map((teacher) => ({ ...teacher }));
}

function cloneSlots(slots: ScheduleSlot[]): ScheduleSlot[] {
  return slots.map((slot) => ({ ...slot }));
}

function assertUniqueIds(ids: string[], message: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new ScheduleIntegrityError(message);
  }
}

export function isSixtyMinuteSlot(startTime: string, endTime: string): boolean {
  const start = parseMinutes(startTime);
  const end = parseMinutes(endTime);
  return start !== undefined && end !== undefined && end - start === 60;
}

function parseMinutes(value: string): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function studentDisplayName(person: {
  firstName: string;
  firstSurname: string;
  secondSurname?: string | null;
}): string {
  return [person.firstName, person.firstSurname, person.secondSurname]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');
}
