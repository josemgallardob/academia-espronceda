import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseConnection } from '../database/database.connection';
import { UsersRepository } from '../database/repositories/users.repository';
import { hashPassword, verifyPassword } from '../security/password-hasher';
import { AdministrativeUsersService } from './administrative-users.service';

describe('AdministrativeUsersService', () => {
  let temporaryDirectory: string;
  let connection: DatabaseConnection;
  let repository: UsersRepository;
  let service: AdministrativeUsersService;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'academia-admin-'));
    connection = await DatabaseConnection.create({
      url: `file:${resolve(temporaryDirectory, 'test.db')}`,
    });
    await connection.migrate(resolve(__dirname, '../../drizzle'));
    repository = new UsersRepository(connection);
    service = new AdministrativeUsersService(repository);
  });

  afterEach(async () => {
    connection.onModuleDestroy();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('creates exactly two initial accounts atomically with Argon2id hashes', async () => {
    const firstPassword = 'primera contraseña administrativa';
    const secondPassword = 'segunda contraseña administrativa';

    await expect(
      service.createInitialAccounts([
        {
          username: 'Profesor1',
          email: 'PROFESOR1@example.com',
          password: firstPassword,
        },
        {
          username: 'Profesor2',
          email: 'profesor2@example.com',
          password: secondPassword,
        },
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        username: 'Profesor1',
        email: 'profesor1@example.com',
      }),
      expect.objectContaining({
        username: 'Profesor2',
        email: 'profesor2@example.com',
      }),
    ]);

    expect(await repository.count()).toBe(2);
    const firstUser = await repository.findByIdentity('profesor1');
    const secondUser = await repository.findByIdentity('PROFESOR2@EXAMPLE.COM');
    expect(firstUser?.passwordHash).toMatch(/^\$argon2id\$/u);
    expect(firstUser?.passwordHash).not.toContain(firstPassword);
    expect(firstUser?.tokenVersion).toBe(0);
    await expect(
      verifyPassword(firstUser?.passwordHash ?? '', firstPassword),
    ).resolves.toBe(true);
    await expect(
      verifyPassword(secondUser?.passwordHash ?? '', secondPassword),
    ).resolves.toBe(true);
  });

  it('rejects duplicate cross-column identities without persisting either account', async () => {
    await expect(
      service.createInitialAccounts([
        {
          username: 'profesor1@example.com',
          email: 'primero@example.com',
          password: 'primera contraseña administrativa',
        },
        {
          username: 'Profesor2',
          email: 'PROFESOR1@example.com',
          password: 'segunda contraseña administrativa',
        },
      ]),
    ).rejects.toThrow('deben ser distintos');
    expect(await repository.count()).toBe(0);
  });

  it('does not allow the initial command to run over an existing account', async () => {
    await repository.insert({
      id: 'existing-user',
      username: 'existing',
      email: 'existing@example.com',
      passwordHash: 'existing-hash',
    });

    await expect(service.assertCanCreateInitialAccounts()).rejects.toThrow(
      'no existen usuarios',
    );
    await expect(
      service.createInitialAccounts([
        {
          username: 'Profesor1',
          email: 'profesor1@example.com',
          password: 'primera contraseña administrativa',
        },
        {
          username: 'Profesor2',
          email: 'profesor2@example.com',
          password: 'segunda contraseña administrativa',
        },
      ]),
    ).rejects.toThrow('no existen usuarios');
    expect(await repository.count()).toBe(1);
  });

  it('changes the hash and increments token_version in one reset operation', async () => {
    const oldPassword = 'contraseña administrativa anterior';
    await repository.insert({
      id: 'user-1',
      username: 'Profesor1',
      email: 'profesor1@example.com',
      passwordHash: await hashPassword(oldPassword),
      tokenVersion: 4,
    });

    const updated = await service.resetPassword(
      'PROFESOR1@EXAMPLE.COM',
      'contraseña administrativa nueva',
    );

    expect(updated.tokenVersion).toBe(5);
    expect(updated.updatedAt).not.toBeNull();
    await expect(
      verifyPassword(updated.passwordHash, oldPassword),
    ).resolves.toBe(false);
    await expect(
      verifyPassword(updated.passwordHash, 'contraseña administrativa nueva'),
    ).resolves.toBe(true);
  });
});
