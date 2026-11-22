import { Request, Response } from 'express';
import { activityService } from '../services/activityService';
import { sendSuccess } from '../utils/apiResponse';

export async function listActivities(req: Request, res: Response): Promise<void> {
  const query = req.query as any;

  const result = await activityService.listActivities({
    page: query.page,
    limit: query.limit,
    action: query.action,
    search: query.search,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });

  sendSuccess(res, result, 'Activities retrieved successfully');
}

export const activityController = {
  listActivities,
};
