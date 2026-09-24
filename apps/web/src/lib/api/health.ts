import type { LivenessResponse, ReadinessResponse } from '@myshop/shared';
import { apiRequest } from './client';

export const healthApi = {
  liveness: () => apiRequest<LivenessResponse>('/health'),
  readiness: () => apiRequest<ReadinessResponse>('/health/ready'),
};
