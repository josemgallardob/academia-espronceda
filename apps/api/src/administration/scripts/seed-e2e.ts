import { loadApiEnvironment } from '../../config/environment';
import {
  assertNoAdministrativeArguments,
  toSafeAdministrativeError,
} from '../administrative-cli';
import { createAdministrativeContext } from '../administrative-context';
import {
  LOCAL_DEMO_ACCOUNTS,
  assertLocalDemoAllowed,
  seedLocalAccountsAndTeachers,
} from '../local-demo-seed';

async function main(): Promise<void> {
  assertNoAdministrativeArguments(process.argv.slice(2));
  const context = await createAdministrativeContext();
  try {
    const environment = loadApiEnvironment();
    assertLocalDemoAllowed({
      nodeEnv: environment.nodeEnv,
      databaseUrl: environment.databaseUrl,
    });
    const report = await seedLocalAccountsAndTeachers(context.connection);
    process.stdout.write(
      'Base e2e lista: cuentas administrativas y catálogo de profesores, sin alumnos.\n',
    );
    for (const [index, user] of report.users.entries()) {
      const password =
        LOCAL_DEMO_ACCOUNTS[index]?.password ?? '(ver entorno e2e)';
      process.stdout.write(`  ${user.username}  /  ${password}\n`);
    }
    process.stdout.write(`Profesores: ${report.teacherIds.length}.\n`);
  } finally {
    context.connection.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  const message = toSafeAdministrativeError(
    error,
    'No se pudo preparar la base e2e.',
  );
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
