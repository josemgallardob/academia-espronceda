import {
  assertNoAdministrativeArguments,
  toSafeAdministrativeError,
} from '../administrative-cli';
import { createAdministrativeContext } from '../administrative-context';
import {
  LOCAL_DEMO_ACCOUNTS,
  assertLocalDemoAllowed,
  seedLocalDemo,
} from '../local-demo-seed';
import { loadApiEnvironment } from '../../config/environment';

async function main(): Promise<void> {
  assertNoAdministrativeArguments(process.argv.slice(2));
  const context = await createAdministrativeContext();
  try {
    const environment = loadApiEnvironment();
    assertLocalDemoAllowed({
      nodeEnv: environment.nodeEnv,
      databaseUrl: environment.databaseUrl,
    });
    const report = await seedLocalDemo(context.connection);
    process.stdout.write(
      'Datos locales de demostración listos para el flujo de horarios.\n\n',
    );
    process.stdout.write('Cuentas administrativas:\n');
    for (const [index, user] of report.users.entries()) {
      const password =
        LOCAL_DEMO_ACCOUNTS[index]?.password ?? '(ver .env.local)';
      process.stdout.write(
        `  ${user.username}  /  ${password}  (${user.email})\n`,
      );
    }
    process.stdout.write(
      `\nProfesores: ${report.teacherIds.length}. Personas: ${report.personIds.length}.\n`,
    );
    process.stdout.write(
      'Abre http://localhost:4200/login, entra y ve a Horario para crear un borrador vacío.\n',
    );
  } finally {
    context.connection.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  const message = toSafeAdministrativeError(
    error,
    'No se pudo preparar el entorno local de demostración.',
  );
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
