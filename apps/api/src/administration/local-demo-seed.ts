import { randomUUID } from 'node:crypto';
import { DatabaseConnection } from '../database/database.connection';
import { PeopleRepository } from '../database/repositories/people.repository';
import { UsersRepository } from '../database/repositories/users.repository';
import { hashPassword } from '../security/password-hasher';
import { AdministrativeUserError } from './administrative-users.service';
import { seedTeacherCatalog } from './teacher-catalog';

export const LOCAL_DEMO_ACCOUNTS = [
  {
    username: 'profesor1',
    email: 'profesor1@local.test',
    password: 'local-only-admin-password-1',
  },
  {
    username: 'profesor2',
    email: 'profesor2@local.test',
    password: 'local-only-admin-password-2',
  },
] as const;

export interface LocalDemoSeedReport {
  users: { username: string; email: string }[];
  teacherIds: string[];
  personIds: string[];
}

export function assertLocalDemoAllowed(input: {
  nodeEnv: string;
  databaseUrl: string;
}): void {
  if (input.nodeEnv === 'production') {
    throw new AdministrativeUserError(
      'El seed de demostración no puede ejecutarse en production.',
    );
  }
  if (!input.databaseUrl.startsWith('file:')) {
    throw new AdministrativeUserError(
      'El seed de demostración solo admite una base local file:.',
    );
  }
}

export async function seedLocalDemo(
  connection: DatabaseConnection,
  source: NodeJS.ProcessEnv = process.env,
): Promise<LocalDemoSeedReport> {
  const users = new UsersRepository(connection);
  const people = new PeopleRepository(connection);
  const alignedUsers = await alignAdministrativeAccounts(users);
  const teacherIds = await seedTeacherCatalog(connection, source);
  const personIds = await seedPeople(people);

  return {
    users: alignedUsers,
    teacherIds,
    personIds,
  };
}

async function alignAdministrativeAccounts(
  users: UsersRepository,
): Promise<{ username: string; email: string }[]> {
  const occurredAt = new Date().toISOString();
  const passwordHashes = await Promise.all(
    LOCAL_DEMO_ACCOUNTS.map((account) => hashPassword(account.password)),
  );
  const existing = await users.listChronological();

  if (existing.length === 0) {
    const created = await users.insertInitialUsers(
      LOCAL_DEMO_ACCOUNTS.map((account, index) => ({
        id: randomUUID(),
        username: account.username,
        email: account.email,
        passwordHash: passwordHashes[index],
      })),
    );
    if (!created) {
      throw new AdministrativeUserError(
        'No se han podido crear las cuentas locales de demostración.',
      );
    }
    return created.map((user) => ({
      username: user.username,
      email: user.email,
    }));
  }

  const targets = existing.slice(0, LOCAL_DEMO_ACCOUNTS.length);
  for (const [index, user] of targets.entries()) {
    await users.updateIdentityAndPassword(user.id, {
      username: `__demo_tmp_${index}`,
      email: `demo-tmp-${index}@local.test`,
      passwordHash: passwordHashes[index],
      occurredAt,
    });
  }
  for (const [index, user] of targets.entries()) {
    const account = LOCAL_DEMO_ACCOUNTS[index];
    await users.updateIdentityAndPassword(user.id, {
      username: account.username,
      email: account.email,
      passwordHash: passwordHashes[index],
      occurredAt,
    });
  }

  if (existing.length === 1) {
    await users.insert({
      id: randomUUID(),
      username: LOCAL_DEMO_ACCOUNTS[1].username,
      email: LOCAL_DEMO_ACCOUNTS[1].email,
      passwordHash: passwordHashes[1],
    });
  }

  return LOCAL_DEMO_ACCOUNTS.map((account) => ({
    username: account.username,
    email: account.email,
  }));
}

async function seedPeople(people: PeopleRepository): Promise<string[]> {
  const mateoId = 'demo-person-mateo';
  const catalog = [
    {
      person: {
        id: 'demo-person-ana',
        firstName: 'Ana',
        firstSurname: 'López',
        courseCode: 'BACH_2' as const,
        weeklyHoursTotal: 2,
        primaryPhone: '600000001',
        schoolName: 'IES Espronceda',
        status: 'ACTIVE' as const,
      },
      subjects: [{ subjectCode: 'MATHEMATICS' as const, weeklyHours: 2 }],
    },
    {
      person: {
        id: 'demo-person-hugo',
        firstName: 'Hugo',
        firstSurname: 'Martín',
        courseCode: 'ESO_3' as const,
        weeklyHoursTotal: 2,
        primaryPhone: '600000002',
        status: 'ACTIVE' as const,
      },
      subjects: [
        { subjectCode: 'MATHEMATICS' as const, weeklyHours: 1 },
        { subjectCode: 'BIOLOGY' as const, weeklyHours: 1 },
      ],
    },
    {
      person: {
        id: 'demo-person-lucia',
        firstName: 'Lucía',
        firstSurname: 'Fernández',
        courseCode: 'BACH_1' as const,
        weeklyHoursTotal: 3,
        primaryPhone: '600000003',
        status: 'ACTIVE' as const,
      },
      subjects: [
        { subjectCode: 'PHYSICS' as const, weeklyHours: 2 },
        { subjectCode: 'ENGLISH' as const, weeklyHours: 1 },
      ],
    },
    {
      person: {
        id: mateoId,
        firstName: 'Mateo',
        firstSurname: 'Ruiz',
        courseCode: 'ESO_1' as const,
        weeklyHoursTotal: 3,
        primaryPhone: '600000004',
        isTutored: true,
        tutorFullName: 'Elena Ruiz',
        status: 'ACTIVE' as const,
      },
      subjects: [
        { subjectCode: 'SPANISH_LANGUAGE' as const, weeklyHours: 2 },
        { subjectCode: 'ENGLISH' as const, weeklyHours: 1 },
      ],
    },
    {
      person: {
        id: 'demo-person-sofia',
        firstName: 'Sofía',
        firstSurname: 'Ruiz',
        courseCode: 'ESO_1' as const,
        weeklyHoursTotal: 2,
        primaryPhone: '600000005',
        isTutored: true,
        tutorFullName: 'Elena Ruiz',
        status: 'ACTIVE' as const,
      },
      subjects: [{ subjectCode: 'ENGLISH' as const, weeklyHours: 2 }],
      relatedPersonIds: [mateoId],
    },
    {
      person: {
        id: 'demo-person-nerea',
        firstName: 'Nerea',
        firstSurname: 'Vidal',
        courseCode: 'ESO_4' as const,
        weeklyHoursTotal: 2,
        primaryPhone: '600000006',
        status: 'WAITING_LIST' as const,
      },
      subjects: [{ subjectCode: 'MATHEMATICS' as const, weeklyHours: 2 }],
    },
  ];

  const ids: string[] = [];
  for (const entry of catalog) {
    const current = await people.findById(entry.person.id);
    if (!current) {
      await people.insert(entry);
    }
    ids.push(entry.person.id);
  }
  return ids;
}
