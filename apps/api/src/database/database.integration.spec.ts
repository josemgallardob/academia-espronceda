import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { DatabaseConnection } from './database.connection';
import { PeopleRepository } from './repositories/people.repository';
import { SchedulesRepository } from './repositories/schedules.repository';
import { TeachersRepository } from './repositories/teachers.repository';
import { UsersRepository } from './repositories/users.repository';
import {
  people,
  scheduleAssignments,
  scheduleClasses,
  schedules,
  scheduleSlots,
  scheduleTeachers,
  subjectTeacherAllocations,
  weeklySlots,
} from './schema';

const fingerprint = `sha256:${'a'.repeat(64)}`;

describe('Drizzle/libSQL persistence', () => {
  let temporaryDirectory: string;
  let connection: DatabaseConnection;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'academia-db-'));
    connection = await DatabaseConnection.create({
      url: `file:${resolve(temporaryDirectory, 'test.db')}`,
    });
    await connection.migrate(resolve(__dirname, '../../drizzle'));
  });

  afterEach(async () => {
    connection.onModuleDestroy();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('applies the real migration and exposes every MVP aggregate table', async () => {
    const result = await connection.client.execute(
      "select name from sqlite_master where type = 'table' order by name",
    );
    const tableNames = result.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string');

    expect(tableNames).toEqual(
      expect.arrayContaining([
        'users',
        'people',
        'person_subjects',
        'teachers',
        'weekly_slots',
        'schedules',
        'schedule_classes',
        'schedule_assignments',
        'schedule_validations',
        'schedule_validation_findings',
        'schedule_confirmations',
      ]),
    );
    await expect(
      connection.db.select().from(weeklySlots),
    ).resolves.toHaveLength(23);
    await expect(
      connection.db
        .select({ id: weeklySlots.id })
        .from(weeklySlots)
        .where(eq(weeklySlots.startTime, '20:00')),
    ).resolves.toEqual(
      expect.arrayContaining([
        { id: 'slot-monday-2000' },
        { id: 'slot-tuesday-2000' },
        { id: 'slot-wednesday-2000' },
        { id: 'slot-thursday-2000' },
      ]),
    );
    await expect(
      connection.db
        .select({ id: weeklySlots.id })
        .from(weeklySlots)
        .where(eq(weeklySlots.startTime, '20:00')),
    ).resolves.toHaveLength(4);
  });

  it('supports base repositories and case-insensitive login identities', async () => {
    const usersRepository = new UsersRepository(connection);
    const teachersRepository = new TeachersRepository(connection);
    const schedulesRepository = new SchedulesRepository(connection);

    await usersRepository.insert({
      id: 'user-1',
      username: 'Admin',
      email: 'admin@example.com',
      passwordHash: 'encoded-password',
    });
    await teachersRepository.insert({
      id: 'teacher-1',
      displayName: 'Profesor Uno',
      profile: 'GENERAL_SCIENCES',
    });
    await schedulesRepository.insert({
      id: 'schedule-1',
      ruleCatalogVersion: '1.0.0',
    });

    await expect(
      usersRepository.findByIdentity('ADMIN'),
    ).resolves.toMatchObject({
      id: 'user-1',
    });
    await expect(teachersRepository.listActive()).resolves.toHaveLength(1);
    await expect(
      schedulesRepository.findById('schedule-1'),
    ).resolves.toMatchObject({ state: 'DRAFT', revision: 0 });
  });

  it('inserts a person atomically only when subject hours equal contracted hours', async () => {
    const repository = new PeopleRepository(connection);
    const person = {
      id: 'person-1',
      firstName: 'Ana',
      firstSurname: 'Ruiz',
      courseCode: 'BACH_1' as const,
      weeklyHoursTotal: 3,
      primaryPhone: '600000000',
      status: 'ACTIVE' as const,
    };

    await expect(
      repository.insert({
        person,
        subjects: [
          { subjectCode: 'MATHEMATICS', weeklyHours: 1 },
          { subjectCode: 'PHYSICS', weeklyHours: 1 },
        ],
      }),
    ).rejects.toThrow('Subject hours must equal');
    await expect(repository.findById(person.id)).resolves.toBeUndefined();

    await expect(
      repository.insert({
        person,
        subjects: [
          { subjectCode: 'MATHEMATICS', weeklyHours: 2 },
          { subjectCode: 'PHYSICS', weeklyHours: 1 },
        ],
      }),
    ).resolves.toMatchObject({ id: person.id, weeklyHoursTotal: 3 });
  });

  it('enforces schedule ownership, one teacher per subject and no student overlap', async () => {
    const peopleRepository = new PeopleRepository(connection);
    const teachersRepository = new TeachersRepository(connection);
    const schedulesRepository = new SchedulesRepository(connection);

    await peopleRepository.insert({
      person: {
        id: 'person-1',
        firstName: 'Ana',
        firstSurname: 'Ruiz',
        courseCode: 'BACH_1',
        weeklyHoursTotal: 3,
        primaryPhone: '600000000',
        status: 'ACTIVE',
      },
      subjects: [
        { subjectCode: 'MATHEMATICS', weeklyHours: 2 },
        { subjectCode: 'PHYSICS', weeklyHours: 1 },
      ],
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
    await schedulesRepository.insert({
      id: 'schedule-1',
      ruleCatalogVersion: '1.0.0',
    });
    await connection.db.insert(scheduleTeachers).values([
      {
        scheduleId: 'schedule-1',
        teacherId: 'teacher-1',
        displayName: 'Profesor Uno',
        profile: 'GENERAL_SCIENCES',
      },
      {
        scheduleId: 'schedule-1',
        teacherId: 'teacher-2',
        displayName: 'Profesor Dos',
        profile: 'SENIOR_SCIENCES',
      },
    ]);
    await connection.db.insert(scheduleSlots).values({
      scheduleId: 'schedule-1',
      slotId: 'slot-monday-1600',
      dayOfWeek: 'MONDAY',
      startTime: '16:00',
      endTime: '17:00',
    });
    await connection.db.insert(scheduleClasses).values([
      {
        id: 'class-1',
        scheduleId: 'schedule-1',
        teacherId: 'teacher-1',
        slotId: 'slot-monday-1600',
      },
      {
        id: 'class-2',
        scheduleId: 'schedule-1',
        teacherId: 'teacher-2',
        slotId: 'slot-monday-1600',
      },
    ]);
    await connection.db.insert(scheduleAssignments).values({
      id: 'assignment-1',
      classId: 'class-1',
      scheduleId: 'schedule-1',
      slotId: 'slot-monday-1600',
      personId: 'person-1',
      studentDisplayName: 'Ana Ruiz',
    });

    await expect(
      connection.db.insert(scheduleAssignments).values({
        id: 'assignment-2',
        classId: 'class-2',
        scheduleId: 'schedule-1',
        slotId: 'slot-monday-1600',
        personId: 'person-1',
        studentDisplayName: 'Ana Ruiz',
      }),
    ).rejects.toThrow();

    await connection.db.insert(subjectTeacherAllocations).values({
      scheduleId: 'schedule-1',
      personId: 'person-1',
      subjectCode: 'MATHEMATICS',
      teacherId: 'teacher-1',
      weeklyHours: 2,
    });
    await expect(
      connection.db.insert(subjectTeacherAllocations).values({
        scheduleId: 'schedule-1',
        personId: 'person-1',
        subjectCode: 'MATHEMATICS',
        teacherId: 'teacher-2',
        weeklyHours: 2,
      }),
    ).rejects.toThrow();

    await expect(peopleRepository.deleteById('person-1')).rejects.toThrow();
    await expect(
      connection.db.select().from(people).where(eq(people.id, 'person-1')),
    ).resolves.toHaveLength(1);
  });

  it('allows only one confirmed schedule to be current', async () => {
    await connection.db.insert(schedules).values({
      id: 'schedule-1',
      state: 'CONFIRMED',
      isCurrent: true,
      ruleCatalogVersion: '1.0.0',
    });

    await expect(
      connection.db.insert(schedules).values({
        id: 'schedule-2',
        state: 'CONFIRMED',
        isCurrent: true,
        ruleCatalogVersion: '1.0.0',
      }),
    ).rejects.toThrow();
    await expect(
      connection.db.insert(schedules).values({
        id: 'schedule-3',
        state: 'DRAFT',
        ruleCatalogVersion: '1.0.0',
      }),
    ).resolves.toBeDefined();
  });

  it('rejects malformed validation fingerprints at the database boundary', async () => {
    await connection.db.insert(schedules).values({
      id: 'schedule-1',
      ruleCatalogVersion: '1.0.0',
    });

    await expect(
      connection.client.execute({
        sql: `insert into schedule_validations
          (id, validation_fingerprint, schedule_id, schedule_revision,
           rule_catalog_version, outcome, can_confirm)
          values (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'validation-bad',
          'not-a-fingerprint',
          'schedule-1',
          0,
          '1.0.0',
          'IDEAL',
          1,
        ],
      }),
    ).rejects.toThrow();

    await expect(
      connection.client.execute({
        sql: `insert into schedule_validations
          (id, validation_fingerprint, schedule_id, schedule_revision,
           rule_catalog_version, outcome, can_confirm)
          values (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'validation-good',
          fingerprint,
          'schedule-1',
          0,
          '1.0.0',
          'IDEAL',
          1,
        ],
      }),
    ).resolves.toBeDefined();
  });
});
