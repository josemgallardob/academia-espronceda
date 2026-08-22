import {
  assertValidNewPassword,
  hashPassword,
  loadPasswordHashingConfiguration,
  MINIMUM_PASSWORD_LENGTH,
  verifyPassword,
} from './password-hasher';

describe('password hashing', () => {
  const password = 'una contraseña larga y segura';

  it('uses the OWASP Argon2id minimums by default', () => {
    expect(loadPasswordHashingConfiguration({})).toEqual({
      memoryCostKiB: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  });

  it('does not allow environment configuration to weaken the minimum costs', () => {
    expect(() =>
      loadPasswordHashingConfiguration({ ARGON2_MEMORY_COST_KIB: '1024' }),
    ).toThrow('ARGON2_MEMORY_COST_KIB');
    expect(() =>
      loadPasswordHashingConfiguration({ ARGON2_TIME_COST: '1' }),
    ).toThrow('ARGON2_TIME_COST');
  });

  it('enforces a minimum password length without composition rules', () => {
    expect(() =>
      assertValidNewPassword('a'.repeat(MINIMUM_PASSWORD_LENGTH - 1)),
    ).toThrow(`al menos ${MINIMUM_PASSWORD_LENGTH}`);
    expect(() =>
      assertValidNewPassword('á'.repeat(MINIMUM_PASSWORD_LENGTH)),
    ).not.toThrow();
  });

  it('creates salted Argon2id hashes and verifies them', async () => {
    const firstHash = await hashPassword(password);
    const secondHash = await hashPassword(password);

    expect(firstHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/u);
    expect(firstHash).not.toContain(password);
    expect(secondHash).not.toBe(firstHash);
    await expect(verifyPassword(firstHash, password)).resolves.toBe(true);
    await expect(
      verifyPassword(firstHash, 'contraseña incorrecta'),
    ).resolves.toBe(false);
    await expect(verifyPassword('$argon2i$invalid', password)).resolves.toBe(
      false,
    );
  });
});
