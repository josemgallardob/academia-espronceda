import { existsSync } from 'node:fs';
import type { DatabaseConnection } from './database.connection';
import { resolveMigrationsFolder } from './migrations-folder';

export async function applyPendingMigrations(
  connection: Pick<DatabaseConnection, 'migrate'>,
  fromDirectory: string = __dirname,
): Promise<string> {
  const folder = resolveMigrationsFolder(fromDirectory);
  if (!existsSync(folder)) {
    throw new Error(`Drizzle migrations folder is missing (${folder}).`);
  }
  await connection.migrate(folder);
  return folder;
}
