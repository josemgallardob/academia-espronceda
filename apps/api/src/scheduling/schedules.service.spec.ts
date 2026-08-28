import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseConnection } from '../database/database.connection';
import { PeopleRepository } from '../database/repositories/people.repository';
import { SchedulesRepository } from '../database/repositories/schedules.repository';
import { TeachersRepository } from '../database/repositories/teachers.repository';
import { UsersRepository } from '../database/repositories/users.repository';
import { WeeklySlotsRepository } from '../database/repositories/weekly-slots.repository';
import { CURRENT_RULE_CATALOG_VERSION } from './schedule';
import { countStudentAssignments } from './schedule-aggregate';
import { ScheduleNotMutableError } from './schedule-errors';
import { SchedulesService } from './schedules.service';

describe('SchedulesService', () => {
  let temporaryDirectory: string;
  let connection: DatabaseConnection;
  let service: SchedulesService;
  let teachers: TeachersRepository;
  let weeklySlots: WeeklySlotsRepository;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(
      resolve(tmpdir(), 'academia-schedule-service-'),
    );
    connection = await DatabaseConnection.create({
      url: `file:${resolve(temporaryDirectory, 'test.db')}`,
    });
    await connection.migrate(resolve(__dirname, '../../drizzle'));
    const people = new PeopleRepository(connection);
    teachers = new TeachersRepository(connection);
    weeklySlots = new WeeklySlotsRepository(connection);
    const users = new UsersRepository(connection);
    service = new SchedulesService(
      new SchedulesRepository(connection),
      people,
      teachers,
      weeklySlots,
      users,
    );
    await users.insert({
      id: 'user-1',
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: 'encoded-password',
    });
    await teachers.insert({
      id: 'teacher-1',
      displayName: 'Profesor Uno',
      profile: 'GENERAL_SCIENCES',
    });
    await teachers.insert({
      id: 'teacher-2',
      displayName: 'Profesor Dos',
      profile: 'LANGUAGES',
    });
    await teachers.insert({
      id: 'teacher-inactive',
      displayName: 'Profesor Inactivo',
      profile: 'SENIOR_SCIENCES',
      isActive: false,
    });
    await people.insert({
      person: {
        id: 'person-1',
        firstName: 'Ana',
        firstSurname: 'Ruiz',
        courseCode: 'BACH_1',
        weeklyHoursTotal: 1,
        primaryPhone: '600000000',
        status: 'ACTIVE',
      },
      subjects: [{ subjectCode: 'MATHEMATICS', weeklyHours: 1 }],
    });
    const slots = await weeklySlots.listActive();
    const slotIds = slots.map((slot) => slot.id);
    await teachers.replaceCapabilities('teacher-1', {
      subjectCodes: ['MATHEMATICS', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY'],
      courseCodes: ['ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1'],
      availableSlotIds: slotIds,
    });
    await teachers.replaceCapabilities('teacher-2', {
      subjectCodes: ['SPANISH_LANGUAGE', 'ENGLISH'],
      courseCodes: ['ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1', 'BACH_2'],
      availableSlotIds: slotIds,
    });
  });

  afterEach(async () => {
    connection.onModuleDestroy();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('creates an empty draft from the live teacher and slot catalog', async () => {
    const draft = await service.createEmptyDraft();

    expect(draft).toMatchObject({
      state: 'DRAFT',
      revision: 0,
      isCurrent: false,
      ruleCatalogVersion: CURRENT_RULE_CATALOG_VERSION,
      classes: [],
    });
    expect(draft.evaluation?.outcome).toBe('IDEAL');
    expect(draft.teachers.map((teacher) => teacher.id).sort()).toEqual([
      'teacher-1',
      'teacher-2',
    ]);
    expect(draft.slots).toHaveLength(23);
    expect(draft.slots.map((slot) => slot.id)).toEqual(
      expect.arrayContaining([
        'slot-monday-2000',
        'slot-tuesday-2000',
        'slot-wednesday-2000',
        'slot-thursday-2000',
      ]),
    );
    expect(
      draft.slots.some(
        (slot) => slot.dayOfWeek === 'FRIDAY' && slot.startTime === '20:00',
      ),
    ).toBe(false);
    await expect(service.list('DRAFT')).resolves.toHaveLength(1);
  });

  it('assigns, moves and confirms a draft while preserving hour counts and validation evidence', async () => {
    const draft = await service.createEmptyDraft();
    const assigned = await service.addAssignment(draft.id, {
      expectedRevision: 0,
      studentId: 'person-1',
      teacherId: 'teacher-1',
      slotId: 'slot-monday-1600',
    });
    expect(assigned.classes[0].assignments[0].studentDisplayName).toBe(
      'Ana Ruiz',
    );
    expect(countStudentAssignments(assigned, 'person-1')).toBe(1);
    expect(assigned.evaluation?.outcome).toBe('HAS_RELAXABLE_CONFLICTS');

    const moved = await service.moveAssignment(draft.id, {
      expectedRevision: assigned.revision,
      assignmentId: assigned.classes[0].assignments[0].id,
      targetTeacherId: 'teacher-1',
      targetSlotId: 'slot-tuesday-1600',
    });
    expect(countStudentAssignments(moved, 'person-1')).toBe(1);
    expect(moved.classes[0]).toMatchObject({
      teacherId: 'teacher-1',
      slotId: 'slot-tuesday-1600',
    });

    const validated = await service.validate(draft.id, moved.revision);
    const confirmed = await service.confirm(draft.id, {
      expectedRevision: validated.revision,
      validationFingerprint: validated.evaluation!.validationFingerprint,
      acceptRelaxableConflicts: true,
      userId: 'user-1',
    });

    expect(confirmed).toMatchObject({
      id: draft.id,
      state: 'CONFIRMED',
      isCurrent: true,
      confirmedByUserId: 'user-1',
    });
    expect(confirmed.acceptedFindingFingerprints.length).toBeGreaterThan(0);
    await expect(service.getCurrent()).resolves.toMatchObject({
      id: draft.id,
      state: 'CONFIRMED',
    });

    const revision = await service.createRevisionFromConfirmed(confirmed.id);
    expect(revision).toMatchObject({
      state: 'DRAFT',
      sourceScheduleId: confirmed.id,
      isCurrent: false,
    });
    await expect(service.get(confirmed.id)).resolves.toMatchObject({
      state: 'CONFIRMED',
      isCurrent: true,
    });
    await expect(
      service.addAssignment(confirmed.id, {
        expectedRevision: confirmed.revision,
        studentId: 'person-1',
        teacherId: 'teacher-1',
        slotId: 'slot-monday-1700',
      }),
    ).rejects.toBeInstanceOf(ScheduleNotMutableError);
  });
});
