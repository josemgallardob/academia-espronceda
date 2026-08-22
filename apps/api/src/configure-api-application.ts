import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { ApiEnvironment } from './config/environment';

export function configureApiApplication(
  app: NestExpressApplication,
  environment: ApiEnvironment,
): void {
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: false,
      whitelist: true,
    }),
  );
  app.enableCors({
    origin: environment.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-XSRF-TOKEN'],
    maxAge: 600,
  });
  app.enableShutdownHooks();

  if (environment.trustProxy) {
    app.set('trust proxy', 1);
  }
}
