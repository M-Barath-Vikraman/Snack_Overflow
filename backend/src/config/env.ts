import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  frontendUrl: string;
  isProduction: boolean;
}

export const config: AppConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'fallback-secret-for-dev-only',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
};

export function validateConfig(): void {
  const warnings: string[] = [];

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('PASTE_RAILWAY')) {
    warnings.push('DATABASE_URL is not configured with a valid connection string.');
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('REPLACE_WITH')) {
    warnings.push('JWT_SECRET is using a placeholder value. Please set a secure secret before production.');
  }

  if (warnings.length > 0) {
    console.warn('\x1b[33m%s\x1b[0m', 'Configuration Notice:');
    warnings.forEach((warn) => console.warn('\x1b[33m%s\x1b[0m', `  - ${warn}`));
  }
}
