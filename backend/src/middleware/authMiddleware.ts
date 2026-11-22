import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { sendError } from '../utils/apiResponse';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 'UNAUTHORIZED', 'Authentication token required', 401);
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token || token.trim() === '') {
    sendError(res, 'UNAUTHORIZED', 'Authentication token cannot be empty', 401);
    return;
  }

  try {
    const payload = verifyToken(token);
    // Explicitly set verified claims on req.user, ignoring any body or query param
    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      sendError(res, 'TOKEN_EXPIRED', 'Authentication token has expired', 401);
      return;
    }
    if (error.name === 'JsonWebTokenError') {
      sendError(res, 'INVALID_TOKEN', 'Invalid authentication token signature or structure', 401);
      return;
    }
    sendError(res, 'INVALID_TOKEN', error.message || 'Invalid authentication token', 401);
  }
}

export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  if (!token || token.trim() === '') {
    return next();
  }

  try {
    const payload = verifyToken(token);
    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    // Continue without user context if token is missing or invalid on public route
  }

  next();
}
