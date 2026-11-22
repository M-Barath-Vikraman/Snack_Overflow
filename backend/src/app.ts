import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { config, validateConfig } from './config/env';
import { isOriginAllowed } from './config/cors';
import routes from './routes';
import { requestLogger } from './middleware/loggerMiddleware';
import { errorHandler } from './middleware/errorMiddleware';
import { sendError } from './utils/apiResponse';
import { logger } from './utils/logger';
import { wsServer } from './websocket/server';
import healthRoutes from './routes/healthRoutes';

// Validate environment variables on startup
validateConfig();

export const app = express();

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Direct health-check endpoint (for cloud/container orchestrators)
app.use('/health', healthRoutes);

// Mount API routes
app.use('/api', routes);

// 404 Route handler
app.use((_req: Request, res: Response) => {
  sendError(res, 'NOT_FOUND', 'The requested resource was not found', 404);
});

// Centralized error handler
app.use(errorHandler);

// Create HTTP server and initialize WebSockets
export const server = http.createServer(app);
wsServer.init(server);

// Start server if executed directly and not in test environment
const isTestExecution =
  process.env.NODE_ENV === 'test' ||
  process.argv.some((arg) => arg.includes('test') || arg.includes('TestSuite'));

if (!isTestExecution) {
  server.listen(config.port, () => {
    logger.info(`Snack Overflow backend running on port ${config.port} [${config.nodeEnv}]`);
    logger.info(`Health check available at http://localhost:${config.port}/health`);
  });

  // Graceful shutdown handling for container environments (SIGTERM & SIGINT)
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);
    server.close(async () => {
      logger.info('HTTP & WebSocket server closed.');
      try {
        const { prisma } = await import('./config/database');
        await prisma.$disconnect();
        logger.info('Database connection pool cleanly closed.');
      } catch (err) {
        logger.error('Error during database disconnect:', err);
      }
      process.exit(0);
    });

    // Force terminate if graceful shutdown hangs
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout threshold.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
