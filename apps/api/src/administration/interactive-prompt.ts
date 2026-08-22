import { Readable, Writable } from 'node:stream';
import { createInterface, type Interface } from 'node:readline/promises';
import {
  assertValidNewPassword,
  PasswordPolicyError,
} from '../security/password-hasher';

class MuteableOutput extends Writable {
  muted = false;

  constructor(private readonly destination: Writable) {
    super();
  }

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (!this.muted) {
      this.destination.write(chunk, encoding);
    }
    callback();
  }
}

export class InteractivePrompt {
  private readonly mutedOutput: MuteableOutput;
  private readonly readline: Interface;

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
  ) {
    if (!isInteractive(input) || !isInteractive(output)) {
      throw new Error('Este comando requiere una terminal interactiva.');
    }

    this.mutedOutput = new MuteableOutput(output);
    this.readline = createInterface({
      input,
      output: this.mutedOutput,
      terminal: true,
    });
  }

  async askRequired(label: string): Promise<string> {
    while (true) {
      const answer = (await this.readline.question(`${label}: `)).trim();
      if (answer) {
        return answer;
      }
      this.writeLine('El valor es obligatorio.');
    }
  }

  async askNewPassword(): Promise<string> {
    while (true) {
      const password = await this.askHidden('Nueva contraseña');
      const confirmation = await this.askHidden('Repite la contraseña');
      if (password !== confirmation) {
        this.writeLine('Las contraseñas no coinciden. Inténtalo de nuevo.');
        continue;
      }

      try {
        assertValidNewPassword(password);
        return password;
      } catch (error) {
        if (error instanceof PasswordPolicyError) {
          this.writeLine(error.message);
          continue;
        }
        throw error;
      }
    }
  }

  writeLine(message = ''): void {
    this.output.write(`${message}\n`);
  }

  close(): void {
    this.readline.close();
  }

  private async askHidden(label: string): Promise<string> {
    this.output.write(`${label}: `);
    this.mutedOutput.muted = true;
    try {
      return await this.readline.question('');
    } finally {
      this.mutedOutput.muted = false;
      this.output.write('\n');
    }
  }
}

function isInteractive(stream: Readable | Writable): boolean {
  return 'isTTY' in stream && stream.isTTY === true;
}
