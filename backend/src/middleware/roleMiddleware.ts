import { Request, Response, NextFunction } from 'express';
import { RoleType } from '../types';
import { sendError } from '../utils/apiResponse';

export function requireRole(allowedRoles: RoleType[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'User context not found', 401);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      sendError(res, 'FORBIDDEN', 'Access forbidden: Insufficient permissions', 403);
      return;
    }

    next();
  };
}
