import { prisma, isDatabaseConfigured } from '../config/database';
import { config } from '../config/env';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  database: {
    configured: boolean;
    status: 'connected' | 'disconnected' | 'unconfigured';
    error?: string;
  };
}

export async function checkHealth(): Promise<HealthCheckResult> {
  const isConfigured = isDatabaseConfigured();
  let dbStatus: 'connected' | 'disconnected' | 'unconfigured' = 'unconfigured';
  let dbError: string | undefined;

  if (isConfigured) {
    try {
      // Simple lightweight query to verify connectivity
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch (err: any) {
      dbStatus = 'disconnected';
      dbError = err.message || 'Database connection error';
    }
  }

  const isHealthy = dbStatus === 'connected' || (!isConfigured && config.nodeEnv === 'development');

  return {
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.nodeEnv,
    database: {
      configured: isConfigured,
      status: dbStatus,
      error: dbError,
    },
  };
}
