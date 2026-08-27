import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseConnection } from '../database/database.connection';
import { PeopleRepository } from '../database/repositories/people.repository';
import { TeachersRepository } from '../database/repositories/teachers.repository';
import { UsersRepository } from '../database/repositories/users.repository';
import { verifyPassword } from '../security/password-hasher';
import { AdministrativeUserError } from './administrative-users.service';
import {
  LOCAL_DEMO_ACCOUNTS,
  assertLocalDemoAllowed,
  seedLocalDemo,
} from './local-demo-seed';

describe('seedLocalDemo', () => {
  let temporaryDirectory: string;
  let connection: DatabaseConnection;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'academia-demo-'));
    connection = await DatabaseConnection.create({
      url: `file:${resolve(temporaryDirectory, 'test.db')}`,
    });
    await connection.migrate(resolve(__dirname, '../../drizzle'));
  });

  afterEach(async () => {
    connection.onModuleDestroy();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('refuses production and remote databases', () => {
    expect(() =>
      assertLocalDemoAllowed({
        nodeEnv: 'production',
        databaseUrl: 'file:./.data/academia-espronceda.db',
      }),
    ).toThrow(AdministrativeUserError);
    expect(() =>
      assertLocalDemoAllowed({
        nodeEnv: 'development',
        databaseUrl: 'libsql://example.turso.io',
      }),
    ).toThrow(AdministrativeUserError);
  });

  it('creates demo users, the three teachers and a usable student roster', async () => {
    const report = await seedLocalDemo(connection);
    const users = new UsersRepository(connection);
    const teachers = new TeachersRepository(connection);
    const people = new PeopleRepository(connection);

    expect(report.users.map((user) => user.username)).toEqual([
      'profesor1',
      'profesor2',
    ]);
    expect(report.teacherIds).toHaveLength(3);
    expect(report.personIds).toHaveLength(6);

    const first = await users.findByIdentity('profesor1');
    await expect(
      verifyPassword(
        first?.passwordHash ?? '',
        LOCAL_DEMO_ACCOUNTS[0].password,
      ),
    ).resolves.toBe(true);

    const capabilities = await teachers.listCapabilities();
    expect(capabilities.map((teacher) => teacher.displayName).sort()).toEqual([
      'Profesor 1',
      'Profesor 2',
      'Profesor 3',
    ]);
    expect(
      capabilities.find((teacher) => teacher.id === 'teacher-languages')
        ?.subjectCodes,
    ).toEqual(['ENGLISH', 'SPANISH_LANGUAGE']);
    expect(
      capabilities.find((teacher) => teacher.id === 'teacher-senior-sciences')
        ?.availableSlotIds,
    ).toEqual(
      expect.arrayContaining([
        'slot-monday-2000',
        'slot-tuesday-2000',
        'slot-wednesday-2000',
        'slot-thursday-2000',
      ]),
    );
    expect(
      capabilities.find((teacher) => teacher.id === 'teacher-general-sciences')
        ?.availableSlotIds,
    ).toEqual(
      expect.arrayContaining(['slot-tuesday-2000', 'slot-thursday-2000']),
    );
    expect(
      capabilities
        .find((teacher) => teacher.id === 'teacher-general-sciences')
        ?.availableSlotIds.filter((slotId) =>
          ['slot-monday-2000', 'slot-wednesday-2000'].includes(slotId),
        ),
    ).toEqual([]);
    expect(
      capabilities
        .find((teacher) => teacher.id === 'teacher-languages')
        ?.availableSlotIds.filter((slotId) => slotId.endsWith('-2000')),
    ).toEqual([]);
    expect(
      capabilities.find((teacher) => teacher.id === 'teacher-senior-sciences')
        ?.availableSlotIds.length,
    ).toBe(23);
    expect(
      capabilities.find((teacher) => teacher.id === 'teacher-general-sciences')
        ?.availableSlotIds.length,
    ).toBe(21);
    expect(
      capabilities.find((teacher) => teacher.id === 'teacher-languages')
        ?.availableSlotIds.length,
    ).toBe(19);

    const ana = await people.findAggregateById('demo-person-ana');
    const nerea = await people.findAggregateById('demo-person-nerea');
    const sofia = await people.findAggregateById('demo-person-sofia');
    expect(ana?.person.status).toBe('ACTIVE');
    expect(nerea?.person.status).toBe('WAITING_LIST');
    expect(sofia?.relatedPersonIds).toContain('demo-person-mateo');
  });

  it('is idempotent and realigns existing local accounts', async () => {
    const users = new UsersRepository(connection);
    await users.insert({
      id: 'legacy-admin',
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: 'legacy-hash',
    });

    await seedLocalDemo(connection);
    const first = await seedLocalDemo(connection);
    const second = await seedLocalDemo(connection);

    expect(first.personIds).toEqual(second.personIds);
    expect(await users.count()).toBe(2);
    const profesor1 = await users.findByIdentity('profesor1');
    expect(profesor1?.id).toBe('legacy-admin');
    await expect(
      verifyPassword(
        profesor1?.passwordHash ?? '',
        LOCAL_DEMO_ACCOUNTS[0].password,
      ),
    ).resolves.toBe(true);
  });
});
