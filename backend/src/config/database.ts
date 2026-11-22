import { PrismaClient } from '@prisma/client';
import { config } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

// Check if database URL is a placeholder or not provided
export const isDatabaseConfigured = (): boolean => {
  return (
    !!config.databaseUrl &&
    !config.databaseUrl.includes('PASTE_RAILWAY') &&
    config.databaseUrl.startsWith('postgres')
  );
};

// Singleton pattern for PrismaClient
export const prisma: PrismaClient =
  global.__prismaClient ||
  new PrismaClient({
    log: config.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (config.nodeEnv !== 'production') {
  global.__prismaClient = prisma;
}

export default prisma;
