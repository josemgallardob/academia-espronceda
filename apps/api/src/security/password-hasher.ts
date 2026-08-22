import { argon2id, hash, verify } from 'argon2';

export const MINIMUM_PASSWORD_LENGTH = 15;

const DEFAULT_MEMORY_COST_KIB = 19_456;
const DEFAULT_TIME_COST = 2;
const DEFAULT_PARALLELISM = 1;
const HASH_LENGTH = 32;

export interface PasswordHashingConfiguration {
  memoryCostKiB: number;
  timeCost: number;
  parallelism: number;
}

export function loadPasswordHashingConfiguration(
  source: NodeJS.ProcessEnv = process.env,
): PasswordHashingConfiguration {
  return {
    memoryCostKiB: readCost(
      source.ARGON2_MEMORY_COST_KIB,
      'ARGON2_MEMORY_COST_KIB',
      DEFAULT_MEMORY_COST_KIB,
      DEFAULT_MEMORY_COST_KIB,
    ),
    timeCost: readCost(
      source.ARGON2_TIME_COST,
      'ARGON2_TIME_COST',
      DEFAULT_TIME_COST,
      DEFAULT_TIME_COST,
    ),
    parallelism: readCost(
      source.ARGON2_PARALLELISM,
      'ARGON2_PARALLELISM',
      DEFAULT_PARALLELISM,
      DEFAULT_PARALLELISM,
    ),
  };
}

export function assertValidNewPassword(password: string): void {
  if ([...password].length < MINIMUM_PASSWORD_LENGTH) {
    throw new PasswordPolicyError(
      `La contraseña debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`,
    );
  }
}

export async function hashPassword(
  password: string,
  configuration = loadPasswordHashingConfiguration(),
): Promise<string> {
  assertValidNewPassword(password);

  return hash(password, {
    type: argon2id,
    memoryCost: configuration.memoryCostKiB,
    timeCost: configuration.timeCost,
    parallelism: configuration.parallelism,
    hashLength: HASH_LENGTH,
  });
}

export async function verifyPassword(
  encodedHash: string,
  password: string,
): Promise<boolean> {
  if (!encodedHash.startsWith('$argon2id$')) {
    return false;
  }
  return verify(encodedHash, password);
}

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordPolicyError';
  }
}

function readCost(
  configuredValue: string | undefined,
  name: string,
  defaultValue: number,
  minimumValue: number,
): number {
  const value = configuredValue?.trim();
  if (!value) {
    return defaultValue;
  }

  const parsedValue = Number(value);
  if (!Number.isSafeInteger(parsedValue) || parsedValue < minimumValue) {
    throw new Error(
      `${name} debe ser un entero mayor o igual que ${minimumValue}.`,
    );
  }

  return parsedValue;
}
