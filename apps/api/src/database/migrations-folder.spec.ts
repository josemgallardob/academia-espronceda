import { resolveMigrationsFolder } from './migrations-folder';

describe('resolveMigrationsFolder', () => {
  it('resolves drizzle SQL next to the compiled API', () => {
    expect(resolveMigrationsFolder('/app/apps/api/dist/database')).toBe(
      '/app/apps/api/drizzle',
    );
  });
});
