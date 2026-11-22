import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { sendSuccess } from '../utils/apiResponse';
import { AppError } from '../middleware/errorMiddleware';

export async function registerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Explicit defense: reject if caller attempted to request an elevated role
    if (req.body.role && req.body.role !== 'MEMBER') {
      throw new AppError('Public registration cannot specify an elevated role', 403, 'ROLE_ESCALATION_FORBIDDEN');
    }

    const result = await authService.register(req.body);
    sendSuccess(res, result, 'User registered successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.login(req.body);
    sendSuccess(res, result, 'Login successful', 200);
  } catch (error) {
    next(error);
  }
}
