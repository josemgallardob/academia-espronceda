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
    const identity = await prompt.askRequired('Usuario o email');
    const password = await prompt.askNewPassword();
    const updated = await context.service.resetPassword(identity, password);
    prompt.writeLine(
      `Contraseña actualizada para ${updated.username}. Sus sesiones anteriores han quedado invalidadas.`,
    );
  } finally {
    prompt.close();
    context?.connection.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  const message = toSafeAdministrativeError(
    error,
    'No se pudo actualizar la contraseña.',
  );
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
