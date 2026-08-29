import { inArray } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseConnection } from '../database/database.connection';
import { PeopleRepository } from '../database/repositories/people.repository';
import { SchedulesRepository } from '../database/repositories/schedules.repository';
import { TeachersRepository } from '../database/repositories/teachers.repository';
import { UsersRepository } from '../database/repositories/users.repository';
import { WeeklySlotsRepository } from '../database/repositories/weekly-slots.repository';
import { scheduleSlots } from '../database/schema';
import { ProblemDetailsException } from '../http/problem-details.exception';
import { CURRENT_RULE_CATALOG_VERSION } from './schedule';
import { countStudentAssignments } from './schedule-aggregate';
import { ScheduleNotMutableError } from './schedule-errors';
import { SchedulesService } from './schedules.service';
import type {
  ScheduleSolver,
  SolveScheduleRequest,
  SolveScheduleResponse,
} from './solver-contract';

describe('SchedulesService', () => {
  let temporaryDirectory: string;
  let connection: DatabaseConnection;
  let service: SchedulesService;
  let people: PeopleRepository;
  let teachers: TeachersRepository;
  let weeklySlots: WeeklySlotsRepository;
  let fakeSolver: FakeSolver;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(
      resolve(tmpdir(), 'academia-schedule-service-'),
    );
    connection = await DatabaseConnection.create({
      url: `file:${resolve(temporaryDirectory, 'test.db')}`,
    });
    await connection.migrate(resolve(__dirname, '../../drizzle'));
    people = new PeopleRepository(connection);
    teachers = new TeachersRepository(connection);
    weeklySlots = new WeeklySlotsRepository(connection);
    const users = new UsersRepository(connection);
    fakeSolver = new FakeSolver();
    service = new SchedulesService(
      new SchedulesRepository(connection),
      people,
      teachers,
      weeklySlots,
      users,
      fakeSolver,
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

  it('backfills 20:00–21:00 onto an older draft snapshot', async () => {
    const draft = await service.createEmptyDraft();
    await connection.db
      .delete(scheduleSlots)
      .where(
        inArray(scheduleSlots.slotId, [
          'slot-monday-2000',
          'slot-tuesday-2000',
          'slot-wednesday-2000',
          'slot-thursday-2000',
        ]),
      );

    const loaded = await service.get(draft.id);

    expect(loaded.slots).toHaveLength(23);
    expect(loaded.slots.map((slot) => slot.id)).toEqual(
      expect.arrayContaining([
        'slot-monday-2000',
        'slot-tuesday-2000',
        'slot-wednesday-2000',
        'slot-thursday-2000',
      ]),
    );
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

  it('persists a generated draft after independent NestJS validation', async () => {
    await insertActiveMathStudent(people, 'person-2', 'Luis');
    await insertActiveMathStudent(people, 'person-3', 'Marta');
    await insertActiveMathStudent(people, 'person-4', 'Pablo');
    fakeSolver.impl = (request) =>
      matchingCapacitySolution(request, 'teacher-1', 'slot-monday-1600');

    const generated = await service.generateDraft();

    expect(generated).toMatchObject({
      state: 'DRAFT',
      evaluation: { outcome: 'IDEAL', canConfirm: true },
    });
    expect(generated.classes[0].assignments).toHaveLength(4);
    expect(
      generated.classes[0].assignments.map((item) => item.studentId).sort(),
    ).toEqual(['person-1', 'person-2', 'person-3', 'person-4']);
    expect(fakeSolver.lastRequest?.students.map((item) => item.status)).toEqual(
      ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE'],
    );
    await expect(service.list('DRAFT')).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: generated.id })]),
    );
  });

  it('persists a second generated draft when the solver reuses class identifiers', async () => {
    await insertActiveMathStudent(people, 'person-2', 'Luis');
    await insertActiveMathStudent(people, 'person-3', 'Marta');
    await insertActiveMathStudent(people, 'person-4', 'Pablo');
    fakeSolver.impl = (request) =>
      matchingCapacitySolution(request, 'teacher-1', 'slot-monday-1600');

    const first = await service.generateDraft();
    const second = await service.generateDraft();

    expect(first.id).not.toBe(second.id);
    expect(first.classes[0].id).not.toBe(second.classes[0].id);
    expect(first.classes[0].id).not.toBe('class-generated');
    expect(second.classes[0].id).not.toBe('class-generated');
  });

  it('does not persist when the solver is infeasible or diverges from NestJS', async () => {
    fakeSolver.impl = (request) => infeasibleResponse(request);
    await expect(service.generateDraft()).rejects.toMatchObject({
      problem: { status: 409, code: 'GENERATION_INFEASIBLE' },
    });
    await expect(service.list('DRAFT')).resolves.toEqual([]);

    await insertActiveMathStudent(people, 'person-2', 'Luis');
    await insertActiveMathStudent(people, 'person-3', 'Marta');
    await insertActiveMathStudent(people, 'person-4', 'Pablo');
    fakeSolver.impl = (request) => {
      const response = matchingCapacitySolution(
        request,
        'teacher-1',
        'slot-monday-1600',
      );
      if (response.solution) {
        response.solution.score.tiers[2] = { priority: 3, penalty: 99 };
      }
      return response;
    };
    await expect(service.generateDraft()).rejects.toBeInstanceOf(
      ProblemDetailsException,
    );
    await expect(service.generateDraft()).rejects.toMatchObject({
      problem: { status: 502, code: 'SOLVER_RESULT_DIVERGED' },
    });
    await expect(service.list('DRAFT')).resolves.toEqual([]);
  });

  it('omits waiting-list students from the solver request', async () => {
    await people.insert({
      person: {
        id: 'person-waiting',
        firstName: 'Nuria',
        firstSurname: 'López',
        courseCode: 'BACH_1',
        weeklyHoursTotal: 1,
        primaryPhone: '600000099',
        status: 'WAITING_LIST',
      },
      subjects: [{ subjectCode: 'MATHEMATICS', weeklyHours: 1 }],
    });
    fakeSolver.impl = (request) => infeasibleResponse(request);

    await expect(service.generateDraft()).rejects.toMatchObject({
      problem: { code: 'GENERATION_INFEASIBLE' },
    });
    expect(fakeSolver.lastRequest?.students.map((item) => item.id)).toEqual([
      'person-1',
    ]);
  });
});

class FakeSolver implements ScheduleSolver {
  lastRequest: SolveScheduleRequest | undefined;
  impl: (request: SolveScheduleRequest) => SolveScheduleResponse =
    infeasibleResponse;

  solve(request: SolveScheduleRequest): Promise<SolveScheduleResponse> {
    this.lastRequest = request;
    return Promise.resolve(this.impl(request));
  }
}

async function insertActiveMathStudent(
  people: PeopleRepository,
  id: string,
  firstName: string,
): Promise<void> {
  await people.insert({
    person: {
      id,
      firstName,
      firstSurname: 'Ruiz',
      courseCode: 'BACH_1',
      weeklyHoursTotal: 1,
      primaryPhone: `600${id.replace(/\D/g, '').padStart(6, '0')}`,
      status: 'ACTIVE',
    },
    subjects: [{ subjectCode: 'MATHEMATICS', weeklyHours: 1 }],
  });
}

function matchingCapacitySolution(
  request: SolveScheduleRequest,
  teacherId: string,
  slotId: string,
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
          id: 'class-generated',
          teacherId,
          slotId,
          studentIds: request.students.map((student) => student.id),
        },
      ],
      subjectTeacherAllocations: [],
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
    },
    elapsedMilliseconds: 1,
    randomSeed: request.options.randomSeed,
    timeLimitSeconds: request.options.timeLimitSeconds,
  };
}

function infeasibleResponse(
  request: SolveScheduleRequest,
): SolveScheduleResponse {
  return {
    contractVersion: request.contractVersion,
    ruleCatalogVersion: request.ruleCatalogVersion,
    requestId: request.requestId,
    mode: 'RELAXED',
    status: 'INFEASIBLE',
    attempts: [
      { mode: 'STRICT', status: 'INFEASIBLE', elapsedMilliseconds: 1 },
      { mode: 'RELAXED', status: 'INFEASIBLE', elapsedMilliseconds: 1 },
    ],
    solution: null,
    elapsedMilliseconds: 2,
    randomSeed: request.options.randomSeed,
    timeLimitSeconds: request.options.timeLimitSeconds,
  };
}
