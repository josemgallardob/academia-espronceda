import { Controller, Get } from '@nestjs/common';
import { SchedulingConfigurationService } from './scheduling-configuration.service';

@Controller('api/v1/scheduling/configuration')
export class SchedulingConfigurationController {
  constructor(
    private readonly configurationService: SchedulingConfigurationService,
  ) {}

  @Get()
  get() {
    return this.configurationService.get();
  }
}
