import { Module } from '@nestjs/common';
import { SchedulingConfigurationController } from './scheduling-configuration.controller';
import { SchedulingConfigurationService } from './scheduling-configuration.service';

@Module({
  controllers: [SchedulingConfigurationController],
  providers: [SchedulingConfigurationService],
})
export class SchedulingConfigurationModule {}
