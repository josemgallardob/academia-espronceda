import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPendingMigrations } from './apply-pending-migrations';

describe('applyPendingMigrations', () => {
  it('applies SQL from the drizzle folder next to the compiled API', async () => {
    const root = mkdtempSync(join(tmpdir(), 'academia-api-'));
    const compiledDatabase = join(root, 'apps', 'api', 'dist', 'database');
    const drizzle = join(root, 'apps', 'api', 'drizzle');
    mkdirSync(compiledDatabase, { recursive: true });
    mkdirSync(drizzle, { recursive: true });

    const migrated: string[] = [];
    const folder = await applyPendingMigrations(
      {
        migrate: (migrationsFolder) => {
          migrated.push(migrationsFolder);
          return Promise.resolve();
        },
      },
      compiledDatabase,
    );

    expect(folder).toBe(drizzle);
    expect(migrated).toEqual([drizzle]);
    rmSync(root, { recursive: true, force: true });
  });

  it('fails when the drizzle folder is missing', async () => {
    const compiledDatabase = join(
      tmpdir(),
      'academia-api-missing-drizzle',
      'dist',
      'database',
    );
    await expect(
      applyPendingMigrations(
        { migrate: () => Promise.resolve() },
        compiledDatabase,
      ),
    ).rejects.toThrow(/Drizzle migrations folder is missing/);
  });
});
