import { resolve } from 'node:path';
import { resolveDatabaseUrl } from './database-url';

describe('resolveDatabaseUrl', () => {
  const repositoryRoot = '/workspace/academia-espronceda';

  it('resolves a local relative file against the supplied repository root', () => {
    expect(
      resolveDatabaseUrl('file:./.data/academia-espronceda.db', repositoryRoot),
    ).toBe(`file:${resolve(repositoryRoot, '.data/academia-espronceda.db')}`);
  });

  it('preserves absolute, in-memory and remote database URLs', () => {
    expect(resolveDatabaseUrl('file:/tmp/database.db', repositoryRoot)).toBe(
      'file:/tmp/database.db',
    );
    expect(resolveDatabaseUrl('file::memory:', repositoryRoot)).toBe(
      'file::memory:',
    );
    expect(
      resolveDatabaseUrl('libsql://database.turso.io', repositoryRoot),
    ).toBe('libsql://database.turso.io');
  });

  it('preserves libSQL query parameters when resolving a relative file', () => {
    expect(
      resolveDatabaseUrl('file:./.data/test.db?mode=rwc', repositoryRoot),
    ).toBe(`file:${resolve(repositoryRoot, '.data/test.db')}?mode=rwc`);
  });
});
