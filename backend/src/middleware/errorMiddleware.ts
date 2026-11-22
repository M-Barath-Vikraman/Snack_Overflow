import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { sendError } from '../utils/apiResponse';
import { logger } from '../utils/logger';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Unhandled Application Error:', err);

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    sendError(res, 'VALIDATION_ERROR', 'Request validation failed', 400, err.errors);
    return;
  }

  // Handle JSON Syntax Errors in request body
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
    sendError(res, 'INVALID_JSON', 'Malformed JSON in request body', 400);
    return;
  }

  // Handle custom known application errors
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  sendError(res, code, message, statusCode, process.env.NODE_ENV === 'development' ? err.stack : undefined);
}
