import { loadApiEnvironment } from '../../config/environment';
import {
  assertNoAdministrativeArguments,
  toSafeAdministrativeError,
} from '../administrative-cli';
import { createAdministrativeContext } from '../administrative-context';
import { resetE2eOperationalData } from '../e2e-operational-data';
import { assertLocalDemoAllowed } from '../local-demo-seed';

async function main(): Promise<void> {
  assertNoAdministrativeArguments(process.argv.slice(2));
  const context = await createAdministrativeContext();
  try {
    const environment = loadApiEnvironment();
    assertLocalDemoAllowed({
      nodeEnv: environment.nodeEnv,
      databaseUrl: environment.databaseUrl,
    });
    await resetE2eOperationalData(context.connection.db);
    process.stdout.write('Datos operativos e2e reiniciados.\n');
  } finally {
    context.connection.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  const message = toSafeAdministrativeError(
    error,
    'No se pudieron reiniciar los datos e2e.',
  );
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
