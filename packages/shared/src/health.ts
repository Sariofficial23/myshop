export type HealthStatus = 'ok' | 'error';

/** GET /api/health — жив ли процесс (liveness). */
export interface LivenessResponse {
  status: HealthStatus;
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

/** GET /api/health/ready — готов ли сервис обслуживать запросы (readiness). */
export interface ReadinessResponse {
  status: HealthStatus;
  checks: {
    database: {
      status: HealthStatus;
      latencyMs?: number;
    };
  };
  timestamp: string;
}
