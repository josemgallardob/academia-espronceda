import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from './auth/auth.decorators';
import { AppService } from './app.service';
import type { HealthStatus, ReadinessStatus } from './app.service';
import type { OperationalMetricsSnapshot } from './observability/operational-metrics';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @Public()
  getHealth(): HealthStatus {
    return this.appService.getHealth();
  }

  @Get('ready')
  @Public()
  async getReady(@Res() response: Response): Promise<void> {
    const readiness = await this.appService.getReadiness();
    response.status(readinessHttpStatus(readiness)).json(readiness);
  }

  @Get('metrics')
  @Public()
  getMetrics(): OperationalMetricsSnapshot {
    return this.appService.getMetrics();
  }
}

export function readinessHttpStatus(readiness: ReadinessStatus): number {
  return readiness.status === 'error' ? 503 : 200;
}
