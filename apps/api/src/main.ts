import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { loadApiEnvironment } from './config/environment';
import { configureApiApplication } from './configure-api-application';

async function bootstrap() {
  const environment = loadApiEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApiApplication(app, environment);

  await app.listen(environment.port, environment.host);
}
void bootstrap();
