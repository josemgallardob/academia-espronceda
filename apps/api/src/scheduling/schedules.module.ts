import { Module } from '@nestjs/common';
import { SchedulesService } from './schedules.service';

@Module({
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
