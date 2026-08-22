import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/auth.decorators';
import { AppService } from './app.service';
import type { HealthStatus } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @Public()
  getHealth(): HealthStatus {
    return this.appService.getHealth();
  }
}
