import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { loadApiEnvironment } from './config/environment';
import { configureApiApplication } from './configure-api-application';
import { applyPendingMigrations } from './database/apply-pending-migrations';
import { DatabaseConnection } from './database/database.connection';
import {
  StructuredNestLogger,
  writeStructuredLog,
} from './observability/structured-log';

async function bootstrap() {
  const environment = loadApiEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(new StructuredNestLogger());
  configureApiApplication(app, environment);

  const folder = await applyPendingMigrations(app.get(DatabaseConnection));
  writeStructuredLog({
    level: 'info',
    event: 'database.migrate',
    status: 'ok',
    folder,
  });

  await app.listen(environment.port, environment.host);
}
void bootstrap();
