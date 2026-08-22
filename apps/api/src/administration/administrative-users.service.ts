import { randomUUID } from 'node:crypto';
import type { UserRow } from '../database/schema';
import { UsersRepository } from '../database/repositories/users.repository';
import { hashPassword } from '../security/password-hasher';

const ADMINISTRATIVE_ACCOUNT_COUNT = 2;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export interface NewAdministrativeAccount {
  username: string;
  email: string;
  password: string;
}

export interface CreatedAdministrativeAccount {
  id: string;
  username: string;
  email: string;
}

export class AdministrativeUsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async assertCanCreateInitialAccounts(): Promise<void> {
    if ((await this.usersRepository.count()) !== 0) {
      throw new AdministrativeUserError(
        'La creación inicial sólo puede ejecutarse cuando no existen usuarios.',
      );
    }
  }

  async createInitialAccounts(
    accounts: readonly NewAdministrativeAccount[],
  ): Promise<CreatedAdministrativeAccount[]> {
    if (accounts.length !== ADMINISTRATIVE_ACCOUNT_COUNT) {
      throw new AdministrativeUserError(
        `Deben proporcionarse exactamente ${ADMINISTRATIVE_ACCOUNT_COUNT} cuentas.`,
      );
    }

    const normalizedAccounts = accounts.map(normalizeAccount);
    assertUniqueIdentities(normalizedAccounts);

    const users = [];
    for (const account of normalizedAccounts) {
      users.push({
        id: randomUUID(),
        username: account.username,
        email: account.email,
        passwordHash: await hashPassword(account.password),
      });
    }

    const created = await this.usersRepository.insertInitialUsers(users);
    if (!created) {
      throw new AdministrativeUserError(
        'La creación inicial sólo puede ejecutarse cuando no existen usuarios.',
      );
    }
    return created.map(toCreatedAccount);
  }

  async resetPassword(identity: string, password: string): Promise<UserRow> {
    const normalizedIdentity = identity.trim();
    if (!normalizedIdentity) {
      throw new AdministrativeUserError('El usuario o email es obligatorio.');
    }

    const user = await this.usersRepository.findByIdentity(normalizedIdentity);
    if (!user) {
      throw new AdministrativeUserError(
        'No existe ninguna cuenta con ese identificador.',
      );
    }

    const occurredAt = new Date().toISOString();
    const passwordHash = await hashPassword(password);
    const updated = await this.usersRepository.updatePasswordAndTokenVersion(
      user.id,
      passwordHash,
      occurredAt,
    );
    if (!updated) {
      throw new AdministrativeUserError(
        'La cuenta dejó de estar disponible durante la operación.',
      );
    }

    return updated;
  }
}

export class AdministrativeUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdministrativeUserError';
  }
}

function normalizeAccount(
  account: NewAdministrativeAccount,
): NewAdministrativeAccount {
  const username = account.username.trim();
  const email = account.email.trim().toLowerCase();
  if (!username) {
    throw new AdministrativeUserError('El nombre de usuario es obligatorio.');
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new AdministrativeUserError('El email no tiene un formato válido.');
  }

  return { username, email, password: account.password };
}

function assertUniqueIdentities(accounts: NewAdministrativeAccount[]): void {
  const identities = accounts.flatMap((account) => [
    account.username.toLowerCase(),
    account.email.toLowerCase(),
  ]);
  if (new Set(identities).size !== identities.length) {
    throw new AdministrativeUserError(
      'Los nombres de usuario y emails deben ser distintos entre las dos cuentas.',
    );
  }
}

function toCreatedAccount(user: UserRow): CreatedAdministrativeAccount {
  return { id: user.id, username: user.username, email: user.email };
}
