import { AdministrativeUserError } from './administrative-users.service';
import { PasswordPolicyError } from '../security/password-hasher';

export function assertNoAdministrativeArguments(args: string[]): void {
  if (args.length > 0) {
    throw new AdministrativeUserError(
      'Este comando no acepta argumentos. Los datos se solicitan de forma interactiva.',
    );
  }
}

export function toSafeAdministrativeError(
  error: unknown,
  fallbackMessage: string,
): string {
  if (
    error instanceof AdministrativeUserError ||
    error instanceof PasswordPolicyError
  ) {
    return error.message;
  }
  return fallbackMessage;
}
