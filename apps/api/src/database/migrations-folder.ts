import { join } from 'node:path';

export function resolveMigrationsFolder(
  fromDirectory: string = __dirname,
): string {
  return join(fromDirectory, '..', '..', 'drizzle');
}
