import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';
import { resolveDatabaseUrl } from './src/database/database-url';

const repositoryRoot = resolve(__dirname, '../..');
const localEnvironmentPath = resolve(repositoryRoot, '.env.local');

if (existsSync(localEnvironmentPath)) {
  process.loadEnvFile(localEnvironmentPath);
}

const databaseUrl = resolveDatabaseUrl(
  process.env.DATABASE_URL ?? 'file:./.data/academia-espronceda.db',
  repositoryRoot,
);
const databaseAuthToken = process.env.DATABASE_AUTH_TOKEN?.trim();

export default defineConfig({
  dialect: 'turso',
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl,
    ...(databaseAuthToken ? { authToken: databaseAuthToken } : {}),
  },
  strict: true,
  verbose: true,
});
