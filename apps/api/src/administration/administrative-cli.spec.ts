import { PassThrough } from 'node:stream';
import {
  assertNoAdministrativeArguments,
  toSafeAdministrativeError,
} from './administrative-cli';
import { InteractivePrompt } from './interactive-prompt';

describe('administrative CLI security', () => {
  it('rejects every command-line argument', () => {
    expect(() => assertNoAdministrativeArguments([])).not.toThrow();
    expect(() =>
      assertNoAdministrativeArguments(['super-secret-password']),
    ).toThrow('no acepta argumentos');
  });

  it('does not expose messages from unexpected internal errors', () => {
    expect(
      toSafeAdministrativeError(
        new Error('database failed while storing super-secret-password'),
        'Operación fallida.',
      ),
    ).toBe('Operación fallida.');
  });

  it('refuses to collect credentials from a non-interactive stream', () => {
    expect(
      () => new InteractivePrompt(new PassThrough(), new PassThrough()),
    ).toThrow('terminal interactiva');
  });

  it('does not echo a password collected interactively', async () => {
    const password = 'contraseña que no debe aparecer';
    const input = Object.assign(new PassThrough(), {
      isTTY: true,
      setRawMode: (): void => undefined,
    });
    const output = Object.assign(new PassThrough(), {
      isTTY: true,
      columns: 80,
      rows: 24,
    });
    let visibleOutput = '';
    let confirmationWritten = false;
    output.on('data', (chunk: Buffer) => {
      visibleOutput += chunk.toString('utf8');
      if (
        visibleOutput.includes('Repite la contraseña') &&
        !confirmationWritten
      ) {
        confirmationWritten = true;
        queueMicrotask(() => input.write(`${password}\n`));
      }
    });
    const prompt = new InteractivePrompt(input, output);

    const answerPromise = prompt.askNewPassword();
    input.write(`${password}\n`);
    await expect(answerPromise).resolves.toBe(password);
    prompt.close();

    expect(visibleOutput).not.toContain(password);
    expect(visibleOutput).toContain('Nueva contraseña');
    expect(visibleOutput).toContain('Repite la contraseña');
  });
});
