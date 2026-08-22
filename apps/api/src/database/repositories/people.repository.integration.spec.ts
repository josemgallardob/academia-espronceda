import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseConnection } from '../database.connection';
import { weeklySlots } from '../schema';
import {
  PeopleActivationConflictError,
  PeopleRepository,
} from './people.repository';

describe('PeopleRepository', () => {
  let temporaryDirectory: string;
  let connection: DatabaseConnection;
  let repository: PeopleRepository;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'academia-people-'));
    connection = await DatabaseConnection.create({
      url: `file:${resolve(temporaryDirectory, 'test.db')}`,
    });
    await connection.migrate(resolve(__dirname, '../../../drizzle'));
    repository = new PeopleRepository(connection);
    await connection.db.insert(weeklySlots).values({
      id: 'slot-1',
      dayOfWeek: 'MONDAY',
      startTime: '16:00',
      endTime: '17:00',
    });
  });

  afterEach(async () => {
    connection.onModuleDestroy();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('persists, reads and replaces the complete person aggregate', async () => {
    await insertPerson(repository, 'person-2', 'WAITING_LIST');
    await repository.insert({
      person: person('person-1', 'WAITING_LIST'),
      subjects: [{ subjectCode: 'MATHEMATICS', weeklyHours: 3 }],
      unavailableSlotIds: ['slot-1'],
      relatedPersonIds: ['person-2'],
    });

    await expect(
      repository.findAggregateById('person-1'),
    ).resolves.toMatchObject({
      subjects: [{ subjectCode: 'MATHEMATICS', weeklyHours: 3 }],
      unavailableSlotIds: ['slot-1'],
      relatedPersonIds: ['person-2'],
    });
    await expect(
      repository.findAggregateById('person-2'),
    ).resolves.toMatchObject({ relatedPersonIds: ['person-1'] });

    await repository.update({
      personId: 'person-1',
      person: { weeklyHoursTotal: 3, updatedAt: new Date().toISOString() },
      subjects: [
        { subjectCode: 'MATHEMATICS', weeklyHours: 2 },
        { subjectCode: 'PHYSICS', weeklyHours: 1 },
      ],
      unavailableSlotIds: [],
      relatedPersonIds: [],
    });

    await expect(
      repository.findAggregateById('person-1'),
    ).resolves.toMatchObject({
      subjects: [
        { subjectCode: 'MATHEMATICS', weeklyHours: 2 },
        { subjectCode: 'PHYSICS', weeklyHours: 1 },
      ],
      unavailableSlotIds: [],
      relatedPersonIds: [],
    });
    await expect(
      repository.findAggregateById('person-2'),
    ).resolves.toMatchObject({ relatedPersonIds: [] });
  });

  it('activates a selection atomically without changing identifiers', async () => {
    await insertPerson(repository, 'person-1', 'WAITING_LIST');
    await insertPerson(repository, 'person-2', 'ACTIVE');

    await expect(
      repository.activate(['person-1', 'person-2'], new Date().toISOString()),
    ).rejects.toBeInstanceOf(PeopleActivationConflictError);
    await expect(repository.findById('person-1')).resolves.toMatchObject({
      status: 'WAITING_LIST',
    });

    await repository.activate(['person-1'], new Date().toISOString());
    await expect(repository.findById('person-1')).resolves.toMatchObject({
      id: 'person-1',
      status: 'ACTIVE',
    });
  });

  it('rejects direct edits that would desynchronise contracted and subject hours', async () => {
    await insertPerson(repository, 'person-1', 'ACTIVE');

    await expect(
      repository.update({
        personId: 'person-1',
        person: { weeklyHoursTotal: 4, updatedAt: new Date().toISOString() },
      }),
    ).rejects.toThrow('Subject hours must equal');
    await expect(
      repository.findAggregateById('person-1'),
    ).resolves.toMatchObject({
      person: { weeklyHoursTotal: 3 },
      subjects: [{ subjectCode: 'MATHEMATICS', weeklyHours: 3 }],
    });
  });

  it('rolls the insertion back if a related aggregate does not exist', async () => {
    await expect(
      repository.insert({
        person: person('person-1', 'ACTIVE'),
        subjects: [{ subjectCode: 'MATHEMATICS', weeklyHours: 3 }],
        relatedPersonIds: ['missing-person'],
      }),
    ).rejects.toThrow();
    await expect(repository.findById('person-1')).resolves.toBeUndefined();
  });
});

async function insertPerson(
  repository: PeopleRepository,
  id: string,
  status: 'ACTIVE' | 'WAITING_LIST',
): Promise<void> {
  await repository.insert({
    person: person(id, status),
    subjects: [{ subjectCode: 'MATHEMATICS', weeklyHours: 3 }],
  });
}

function person(id: string, status: 'ACTIVE' | 'WAITING_LIST') {
  return {
    id,
    firstName: `Nombre ${id}`,
    firstSurname: 'Ruiz',
    courseCode: 'BACH_1' as const,
    weeklyHoursTotal: 3,
    primaryPhone: '600000000',
    status,
  };
}
