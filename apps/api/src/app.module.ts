import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { E2eResetModule } from './e2e/e2e-reset.module';
import { PeopleModule } from './people/people.module';
import { SchedulingConfigurationModule } from './scheduling-configuration/scheduling-configuration.module';
import { SchedulesModule } from './scheduling/schedules.module';

const e2eImports = process.env.E2E_RESET_TOKEN ? [E2eResetModule] : [];

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    PeopleModule,
    SchedulingConfigurationModule,
    SchedulesModule,
    ...e2eImports,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
