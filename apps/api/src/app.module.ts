import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { PeopleModule } from './people/people.module';
import { SchedulingConfigurationModule } from './scheduling-configuration/scheduling-configuration.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    PeopleModule,
    SchedulingConfigurationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
