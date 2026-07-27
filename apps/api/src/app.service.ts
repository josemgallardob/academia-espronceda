import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  service: 'api';
  status: 'ok';
}

@Injectable()
export class AppService {
  getHealth(): HealthStatus {
    return {
      service: 'api',
      status: 'ok',
    };
  }
}
