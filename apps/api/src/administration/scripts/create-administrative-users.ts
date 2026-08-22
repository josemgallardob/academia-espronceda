import { stdin, stdout } from 'node:process';
import {
  assertNoAdministrativeArguments,
  toSafeAdministrativeError,
} from '../administrative-cli';
import { createAdministrativeContext } from '../administrative-context';
import { InteractivePrompt } from '../interactive-prompt';

async function main(): Promise<void> {
  assertNoAdministrativeArguments(process.argv.slice(2));
  const prompt = new InteractivePrompt(stdin, stdout);
  let context:
    Awaited<ReturnType<typeof createAdministrativeContext>> | undefined;

  try {
    context = await createAdministrativeContext();
    await context.service.assertCanCreateInitialAccounts();
    prompt.writeLine('Se crearán las dos cuentas administrativas del sistema.');

    const accounts = [];
    for (let position = 1; position <= 2; position += 1) {
      prompt.writeLine();
      prompt.writeLine(`Cuenta ${position}`);
      accounts.push({
        username: await prompt.askRequired('Usuario'),
        email: await prompt.askRequired('Email'),
        password: await prompt.askNewPassword(),
      });
    }

    const created = await context.service.createInitialAccounts(accounts);
    prompt.writeLine();
    prompt.writeLine(
      `Cuentas creadas correctamente: ${created.map((user) => user.username).join(', ')}.`,
    );
  } finally {
    prompt.close();
    context?.connection.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  const message = toSafeAdministrativeError(
    error,
    'No se pudo crear las cuentas administrativas.',
  );
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
