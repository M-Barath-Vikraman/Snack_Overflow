import { Request, Response } from 'express';
import { checkHealth } from '../services/healthService';
import { sendSuccess } from '../utils/apiResponse';

export async function getHealth(_req: Request, res: Response): Promise<void> {
  const health = await checkHealth();
  sendSuccess(res, health, 'Service health check completed', 200);
}
