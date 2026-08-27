import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  addAssignment,
  attachEvaluation,
  confirmSchedule,
  createDraftFromConfirmed,
  createEmptyDraft,
  moveAssignment,
} from '../../scheduling/schedule-aggregate';
import type {
  Schedule,
  ScheduleEvaluation,
  ScheduleTeacher,
} from '../../scheduling/schedule';
import {
  ScheduleNotMutableError,
  ScheduleRevisionConflictError,
} from '../../scheduling/schedule-errors';
import { DatabaseConnection } from '../database.connection';
import { PeopleRepository } from './people.repository';
import { SchedulesRepository } from './schedules.repository';
import { TeachersRepository } from './teachers.repository';
import { UsersRepository } from './users.repository';

const now = '2026-08-26T10:00:00.000Z';

describe('SchedulesRepository', () => {
  let temporaryDirectory: string;
  let connection: DatabaseConnection;
  let schedulesRepository: SchedulesRepository;
  let peopleRepository: PeopleRepository;
  let teachersRepository: TeachersRepository;
  let usersRepository: UsersRepository;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(
      resolve(tmpdir(), 'academia-schedules-'),
    );
    connection = await DatabaseConnection.create({
      url: `file:${resolve(temporaryDirectory, 'test.db')}`,
    });
    await connection.migrate(resolve(__dirname, '../../../drizzle'));
    schedulesRepository = new SchedulesRepository(connection);
    peopleRepository = new PeopleRepository(connection);
    teachersRepository = new TeachersRepository(connection);
    usersRepository = new UsersRepository(connection);
    await seedCatalog();
  });

  afterEach(async () => {
    connection.onModuleDestroy();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('persists and reloads a draft aggregate with classes and assignments', async () => {
    const draft = assignedDraft();
    await schedulesRepository.save(draft, null);

    await expect(
      schedulesRepository.findAggregateById(draft.id),
    ).resolves.toEqual(draft);
    await expect(schedulesRepository.listSummaries()).resolves.toEqual([
      {
        id: draft.id,
        state: 'DRAFT',
        revision: 1,
        isCurrent: false,
        createdAt: now,
        confirmedAt: null,
      },
    ]);
  });

  it('confirms a schedule, stores accepted findings and keeps a single current revision', async () => {
    const first = await confirmAndSave(assignedDraft('schedule-1'), 'user-1');
    const secondDraft = assignedDraft('schedule-2');
    const second = await confirmAndSave(secondDraft, 'user-1');

    const reloadedFirst = await schedulesRepository.findAggregateById(first.id);
    const current = await schedulesRepository.findCurrentAggregate();

    expect(reloadedFirst).toMatchObject({
      state: 'CONFIRMED',
      isCurrent: false,
      acceptedFindingFingerprints: [fingerprint('1')],
    });
    expect(current).toMatchObject({
      id: second.id,
      state: 'CONFIRMED',
      isCurrent: true,
      confirmedByUserId: 'user-1',
    });
    expect(current?.evaluation?.findings).toHaveLength(2);
    expect(current?.classes[0].findingFingerprints).toEqual([
      fingerprint('1'),
      fingerprint('2'),
    ]);
  });

  it('creates a revision draft from a confirmed schedule without changing the source', async () => {
    const confirmed = await confirmAndSave(assignedDraft(), 'user-1');
    let serial = 0;
    const draft = createDraftFromConfirmed(confirmed, {
      id: 'schedule-revision',
      createdAt: '2026-08-26T11:00:00.000Z',
      identity: () => `rev-${++serial}`,
    });
    await schedulesRepository.save(draft, null);

    await expect(
      schedulesRepository.findAggregateById(confirmed.id),
    ).resolves.toEqual(confirmed);
    await expect(
      schedulesRepository.findAggregateById(draft.id),
    ).resolves.toMatchObject({
      id: 'schedule-revision',
      state: 'DRAFT',
      sourceScheduleId: confirmed.id,
      evaluation: null,
      classes: [{ assignments: [{ studentId: 'person-1' }] }],
    });
  });

  it('rejects concurrent mutations of the same revision', async () => {
    const original = assignedDraft();
    await schedulesRepository.save(original, null);
    const firstMove = moveAssignment(
      original,
      {
        expectedRevision: 1,
        assignmentId: 'schedule-1-assignment-1',
        targetTeacherId: 'teacher-2',
        targetSlotId: 'slot-monday-1700',
      },
      {
        assignmentId: 'schedule-1-assignment-1',
        classId: 'class-2',
        updatedAt: now,
      },
    );
    const secondMove = moveAssignment(
      original,
      {
        expectedRevision: 1,
        assignmentId: 'schedule-1-assignment-1',
        targetTeacherId: 'teacher-2',
        targetSlotId: 'slot-monday-1700',
      },
      {
        assignmentId: 'schedule-1-assignment-1',
        classId: 'class-3',
        updatedAt: now,
      },
    );

    await schedulesRepository.save(firstMove, original.revision);
    await expect(
      schedulesRepository.save(secondMove, original.revision),
    ).rejects.toBeInstanceOf(ScheduleRevisionConflictError);
    await expect(
      schedulesRepository.findAggregateById(original.id),
    ).resolves.toMatchObject({
      revision: 2,
      classes: [{ id: 'class-2', teacherId: 'teacher-2' }],
    });
  });

  it('refuses to mutate a confirmed schedule at the persistence boundary', async () => {
    const confirmed = await confirmAndSave(assignedDraft(), 'user-1');
    const spoofedDraft: Schedule = {
      ...confirmed,
      state: 'DRAFT',
      isCurrent: false,
      confirmedAt: null,
      confirmedByUserId: null,
      acceptedFindingFingerprints: [],
    };

    await expect(
      schedulesRepository.save(spoofedDraft, confirmed.revision),
    ).rejects.toBeInstanceOf(ScheduleNotMutableError);
    await expect(
      schedulesRepository.findAggregateById(confirmed.id),
    ).resolves.toMatchObject({
      state: 'CONFIRMED',
      isCurrent: true,
    });
  });

  it('keeps person deletion blocked while a draft still references the student', async () => {
    await schedulesRepository.save(assignedDraft(), null);
    await expect(peopleRepository.deleteById('person-1')).rejects.toThrow();
  });

  async function seedCatalog(): Promise<void> {
    await usersRepository.insert({
      id: 'user-1',
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: 'encoded-password',
    });
    await teachersRepository.insert({
      id: 'teacher-1',
      displayName: 'Profesor Uno',
      profile: 'GENERAL_SCIENCES',
    });
    await teachersRepository.insert({
      id: 'teacher-2',
      displayName: 'Profesor Dos',
      profile: 'SENIOR_SCIENCES',
    });
    await peopleRepository.insert({
      person: {
        id: 'person-1',
        firstName: 'Ana',
        firstSurname: 'Ruiz',
        courseCode: 'BACH_1',
        weeklyHoursTotal: 2,
        primaryPhone: '600000000',
        status: 'ACTIVE',
      },
      subjects: [
        { subjectCode: 'MATHEMATICS', weeklyHours: 1 },
        { subjectCode: 'PHYSICS', weeklyHours: 1 },
      ],
    });
  }

  async function confirmAndSave(
    draft: Schedule,
    userId: string,
  ): Promise<Schedule> {
    const evaluated = attachEvaluation(
      draft,
      capacityEvaluation(draft),
      draft.revision,
    );
    await schedulesRepository.save(evaluated, null);
    const confirmed = confirmSchedule(evaluated, {
      expectedRevision: evaluated.revision,
      validationFingerprint: evaluated.evaluation!.validationFingerprint,
      acceptRelaxableConflicts: true,
      userId,
      confirmedAt: '2026-08-26T10:05:00.000Z',
    });
    await schedulesRepository.save(confirmed, evaluated.revision);
    return (await schedulesRepository.findAggregateById(confirmed.id))!;
  }
});

function assignedDraft(id = 'schedule-1'): Schedule {
  const empty = createEmptyDraft({
    id,
    createdAt: now,
    teachers,
    slots: [
      {
        id: 'slot-monday-1600',
        dayOfWeek: 'MONDAY',
        startTime: '16:00',
        endTime: '17:00',
      },
      {
        id: 'slot-monday-1700',
        dayOfWeek: 'MONDAY',
        startTime: '17:00',
        endTime: '18:00',
      },
    ],
  });
  return addAssignment(
    empty,
    {
      expectedRevision: 0,
      studentId: 'person-1',
      studentDisplayName: 'Ana Ruiz',
      studentStatus: 'ACTIVE',
      weeklyHoursTotal: 2,
      teacherId: 'teacher-1',
      slotId: 'slot-monday-1600',
    },
    {
      assignmentId: `${id}-assignment-1`,
      classId: `${id}-class-1`,
      updatedAt: now,
    },
  );
}

function capacityEvaluation(schedule: Schedule): ScheduleEvaluation {
  const classId = schedule.classes[0].id;
  return {
    id: `validation-${schedule.id}`,
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
        fingerprint: fingerprint('1'),
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
        fingerprint: fingerprint('2'),
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

const teachers: ScheduleTeacher[] = [
  { id: 'teacher-1', displayName: 'Profesor Uno', profile: 'GENERAL_SCIENCES' },
  { id: 'teacher-2', displayName: 'Profesor Dos', profile: 'SENIOR_SCIENCES' },
];

function fingerprint(digit: string): string {
  return `sha256:${digit.repeat(64)}`;
}
