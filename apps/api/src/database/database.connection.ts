import { createClient, type Client, type Config } from '@libsql/client';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ApiEnvironment } from '../config/environment';
import { resolveDatabaseUrl } from './database-url';
import * as schema from './schema';

export type Database = LibSQLDatabase<typeof schema>;

export interface DatabaseConfiguration {
  url: string;
  authToken?: string;
}

@Injectable()
export class DatabaseConnection implements OnModuleDestroy {
  readonly client: Client;
  readonly db: Database;

  private constructor(client: Client) {
    this.client = client;
    this.db = drizzle({ client, schema });
  }

  static async create(
    configuration: DatabaseConfiguration,
  ): Promise<DatabaseConnection> {
    const databaseUrl = resolveDatabaseUrl(
      configuration.url,
      process.env.INIT_CWD ?? process.cwd(),
    );
    await prepareLocalDatabaseDirectory(databaseUrl);

    const clientConfiguration: Config = { url: databaseUrl };
    if (configuration.authToken) {
      clientConfiguration.authToken = configuration.authToken;
    }

    const connection = new DatabaseConnection(
      createClient(clientConfiguration),
    );
    await connection.client.execute('PRAGMA foreign_keys = ON');
    if (databaseUrl.startsWith('file:')) {
      await connection.client.execute('PRAGMA journal_mode = WAL');
      await connection.client.execute('PRAGMA busy_timeout = 5000');
    }
    return connection;
  }

  async ping(): Promise<void> {
    await this.client.execute('SELECT 1');
  }

  async migrate(migrationsFolder: string): Promise<void> {
    await migrate(this.db, { migrationsFolder });
  }

  onModuleDestroy(): void {
    this.client.close();
  }
}

async function prepareLocalDatabaseDirectory(url: string): Promise<void> {
  if (!url.startsWith('file:')) {
    return;
  }

  const configuredPath = url.slice('file:'.length).split('?')[0];
  if (!configuredPath || configuredPath === ':memory:') {
    return;
  }

  await mkdir(dirname(resolve(configuredPath)), { recursive: true });
}

export function databaseConfigurationFromEnvironment(
  environment: Pick<ApiEnvironment, 'databaseUrl' | 'databaseAuthToken'>,
): DatabaseConfiguration {
  return {
    url: environment.databaseUrl,
    authToken: environment.databaseAuthToken,
  };
}
