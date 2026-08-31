import { Injectable } from '@nestjs/common';
import { loadApiEnvironment } from './config/environment';
import { DatabaseConnection } from './database/database.connection';
import { snapshotOperationalMetrics } from './observability/operational-metrics';
import { probeSolverHealth } from './observability/solver-health';

export interface HealthStatus {
  service: 'api';
  status: 'ok';
}

export type DependencyStatus = 'ok' | 'error';
export type ReadinessStatusCode = 'ok' | 'degraded' | 'error';

export interface ReadinessStatus {
  service: 'api';
  status: ReadinessStatusCode;
  checks: {
    database: DependencyStatus;
    solver: DependencyStatus;
  };
}

@Injectable()
export class AppService {
  constructor(private readonly database: DatabaseConnection) {}

  getHealth(): HealthStatus {
    return {
      service: 'api',
      status: 'ok',
    };
  }

  async getReadiness(): Promise<ReadinessStatus> {
    const [database, solver] = await Promise.all([
      this.checkDatabase(),
      probeSolverHealth(loadApiEnvironment().solverUrl),
    ]);
    return {
      service: 'api',
      status: readinessStatus(database, solver),
      checks: { database, solver },
    };
  }

  getMetrics() {
    return snapshotOperationalMetrics();
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    try {
      await this.database.ping();
      return 'ok';
    } catch {
      return 'error';
    }
  }
}

export function readinessStatus(
  database: DependencyStatus,
  solver: DependencyStatus,
): ReadinessStatusCode {
  if (database === 'error') {
    return 'error';
  }
  return solver === 'ok' ? 'ok' : 'degraded';
}
