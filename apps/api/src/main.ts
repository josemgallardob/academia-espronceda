import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { loadApiEnvironment } from './config/environment';
import { configureApiApplication } from './configure-api-application';
import { StructuredNestLogger } from './observability/structured-log';

async function bootstrap() {
  const environment = loadApiEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(new StructuredNestLogger());
  configureApiApplication(app, environment);

  await app.listen(environment.port, environment.host);
}
void bootstrap();
