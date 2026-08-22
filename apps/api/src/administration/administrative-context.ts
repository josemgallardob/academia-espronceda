import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AdministrativeUserError } from './administrative-users.service';
import { loadApiEnvironment } from '../config/environment';
import {
  DatabaseConnection,
  databaseConfigurationFromEnvironment,
} from '../database/database.connection';
import { resolveDatabaseUrl } from '../database/database-url';
import { UsersRepository } from '../database/repositories/users.repository';
import { AdministrativeUsersService } from './administrative-users.service';

export interface AdministrativeContext {
  connection: DatabaseConnection;
  service: AdministrativeUsersService;
}

export async function createAdministrativeContext(): Promise<AdministrativeContext> {
  const repositoryRoot = resolve(__dirname, '../../../..');
  const localEnvironmentPath = resolve(repositoryRoot, '.env.local');
  if (existsSync(localEnvironmentPath)) {
    process.loadEnvFile(localEnvironmentPath);
  }

  const environment = loadApiEnvironment();
  const configuration = databaseConfigurationFromEnvironment(environment);
  configuration.url = resolveDatabaseUrl(configuration.url, repositoryRoot);
  const connection = await DatabaseConnection.create(configuration);

  try {
    await connection.client.execute('select 1 from users limit 1');
  } catch {
    connection.onModuleDestroy();
    throw new AdministrativeUserError(
      'La base de datos no está preparada. Ejecuta primero npm run db:migrate.',
    );
  }

  return {
    connection,
    service: new AdministrativeUsersService(new UsersRepository(connection)),
  };
}
