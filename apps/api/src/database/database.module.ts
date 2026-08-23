import { Global, Module } from '@nestjs/common';
import { loadApiEnvironment } from '../config/environment';
import {
  DatabaseConnection,
  databaseConfigurationFromEnvironment,
} from './database.connection';
import { PeopleRepository } from './repositories/people.repository';
import { SchedulesRepository } from './repositories/schedules.repository';
import { TeachersRepository } from './repositories/teachers.repository';
import { UsersRepository } from './repositories/users.repository';
import { WeeklySlotsRepository } from './repositories/weekly-slots.repository';

@Global()
@Module({
  providers: [
    {
      provide: DatabaseConnection,
      useFactory: async (): Promise<DatabaseConnection> =>
        DatabaseConnection.create(
          databaseConfigurationFromEnvironment(loadApiEnvironment()),
        ),
    },
    UsersRepository,
    PeopleRepository,
    TeachersRepository,
    SchedulesRepository,
    WeeklySlotsRepository,
  ],
  exports: [
    DatabaseConnection,
    UsersRepository,
    PeopleRepository,
    TeachersRepository,
    SchedulesRepository,
    WeeklySlotsRepository,
  ],
})
export class DatabaseModule {}
