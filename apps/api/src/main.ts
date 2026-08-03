import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { loadApiEnvironment } from './config/environment';

async function bootstrap() {
  const environment = loadApiEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: environment.corsOrigins,
    credentials: true,
  });
  app.enableShutdownHooks();

  if (environment.trustProxy) {
    app.set('trust proxy', 1);
  }

  await app.listen(environment.port, environment.host);
}
void bootstrap();
