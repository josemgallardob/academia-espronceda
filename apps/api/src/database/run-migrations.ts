import { resolveMigrationsFolder } from './migrations-folder';
import { loadApiEnvironment } from '../config/environment';
import { writeStructuredLog } from '../observability/structured-log';
import {
  DatabaseConnection,
  databaseConfigurationFromEnvironment,
} from './database.connection';

async function main(): Promise<void> {
  const environment = loadApiEnvironment();
  const connection = await DatabaseConnection.create(
    databaseConfigurationFromEnvironment(environment),
  );
  try {
    const migrationsFolder = resolveMigrationsFolder();
    await connection.migrate(migrationsFolder);
    writeStructuredLog({
      level: 'info',
      event: 'database.migrate',
      status: 'ok',
      folder: migrationsFolder,
    });
  } finally {
    connection.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Migration failed.';
  writeStructuredLog({
    level: 'error',
    event: 'database.migrate',
    status: 'error',
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
