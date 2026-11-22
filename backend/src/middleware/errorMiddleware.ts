import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { sendError } from '../utils/apiResponse';
import { logger } from '../utils/logger';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 400, code: string = 'BAD_REQUEST', details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Unhandled Application Error:', err);

  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    sendError(res, 'VALIDATION_ERROR', 'Request validation failed', 400, err.errors);
    return;
  }

  // 2. JSON Syntax Errors in request body
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
    sendError(res, 'INVALID_JSON', 'Malformed JSON in request body', 400);
    return;
  }

  // 3. Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[]) || [];
      const field = target.join(', ');
      sendError(res, 'CONFLICT', `A resource with this ${field || 'value'} already exists`, 409);
      return;
    }

    if (err.code === 'P2003' || err.code === 'P2014') {
      sendError(
        res,
        'RELATION_RESTRICTED',
        'Cannot complete operation because dependent historical records are restricted from deletion',
        409
      );
      return;
    }

    if (err.code === 'P2025') {
      sendError(res, 'NOT_FOUND', 'Requested resource was not found', 404);
      return;
    }
  }

  // 4. PostgreSQL foreign key RESTRICT violations wrapped in generic errors
  if (
    err.message?.includes('violates RESTRICT setting') ||
    err.message?.includes('foreign key constraint') ||
    err.message?.includes('23001')
  ) {
    sendError(
      res,
      'RELATION_RESTRICTED',
      'Cannot complete operation because dependent historical records are restricted from deletion',
      409
    );
    return;
  }

  // 4. Custom AppError instances
  if (err instanceof AppError) {
    sendError(res, err.code, err.message, err.statusCode, err.details);
    return;
  }

  // 5. Default Internal Server Error (hide internal details from client)
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  sendError(
    res,
    code,
    message,
    statusCode,
    process.env.NODE_ENV === 'development' ? err.stack : undefined
  );
}
