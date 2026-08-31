import { Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { resetE2eOperationalData } from '../administration/e2e-operational-data';
import { Public, SkipXsrf } from '../auth/auth.decorators';
import { DatabaseConnection } from '../database/database.connection';
import { ProblemDetailsException } from '../http/problem-details.exception';

@Controller('api/v1/e2e')
export class E2eResetController {
  constructor(private readonly connection: DatabaseConnection) {}

  @Post('operational-data/reset')
  @HttpCode(204)
  @Public()
  @SkipXsrf()
  async reset(@Headers('x-e2e-reset-token') token?: string): Promise<void> {
    if (!tokensMatch(token, process.env.E2E_RESET_TOKEN)) {
      throw new ProblemDetailsException({
        status: 403,
        code: 'E2E_RESET_FORBIDDEN',
        title: 'Reinicio e2e no autorizado',
      });
    }

    await resetE2eOperationalData(this.connection.db);
  }
}

function tokensMatch(
  provided: string | undefined,
  expected: string | undefined,
): boolean {
  if (!provided || !expected) {
    return false;
  }

  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
