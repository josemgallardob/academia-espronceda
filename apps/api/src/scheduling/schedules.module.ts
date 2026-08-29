import { Module } from '@nestjs/common';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { SolverHttpClient } from './solver-client';
import { SCHEDULE_SOLVER } from './solver-contract';

@Module({
  controllers: [SchedulesController],
  providers: [
    {
      provide: SCHEDULE_SOLVER,
      useFactory: (): SolverHttpClient => new SolverHttpClient(),
    },
    SchedulesService,
  ],
  exports: [SchedulesService],
})
export class SchedulesModule {}
