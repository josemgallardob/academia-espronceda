import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseConnection } from '../database/database.connection';
import { TeachersRepository } from '../database/repositories/teachers.repository';
import { AdministrativeUserError } from './administrative-users.service';
import { seedTeacherCatalog } from './teacher-catalog';

describe('seedTeacherCatalog', () => {
  let temporaryDirectory: string;
  let connection: DatabaseConnection;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'academia-teachers-'));
    connection = await DatabaseConnection.create({
      url: `file:${resolve(temporaryDirectory, 'test.db')}`,
    });
    await connection.migrate(resolve(__dirname, '../../drizzle'));
  });

  afterEach(async () => {
    connection.onModuleDestroy();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('creates the catalog and can run again without changing ids', async () => {
    const first = await seedTeacherCatalog(connection);
    const second = await seedTeacherCatalog(connection);
    const teachers = new TeachersRepository(connection);

    expect(first).toEqual(second);
    expect((await teachers.listActive()).map((teacher) => teacher.id)).toEqual([
      'teacher-senior-sciences',
      'teacher-general-sciences',
      'teacher-languages',
    ]);
  });

  it('updates labels and deactivates teachers outside the catalog', async () => {
    const teachers = new TeachersRepository(connection);
    await teachers.insert({
      id: 'teacher-legacy',
      displayName: 'Profesor Extra',
      profile: 'GENERAL_SCIENCES',
    });

    await seedTeacherCatalog(connection, {
      TEACHER_1_DISPLAY_NAME: 'Martín',
      TEACHER_2_DISPLAY_NAME: 'Javier',
      TEACHER_3_DISPLAY_NAME: 'Mari Carmen',
    });

    expect(
      (await teachers.listActive()).map((teacher) => teacher.displayName),
    ).toEqual(['Martín', 'Javier', 'Mari Carmen']);
    expect((await teachers.findById('teacher-legacy'))?.isActive).toBe(false);
  });

  it('refuses to run when the weekly slot catalog is empty', async () => {
    await connection.client.execute('delete from weekly_slots');
    await expect(seedTeacherCatalog(connection)).rejects.toBeInstanceOf(
      AdministrativeUserError,
    );
  });
});
