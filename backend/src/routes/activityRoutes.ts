import { Router } from 'express';
import { activityController } from '../controllers/activityController';
import { authenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';
import { validateRequest } from '../middleware/validateMiddleware';
import { listActivitiesSchema } from '../schemas/activitySchemas';

const router = Router();

// GET /api/activities - Admin-only activity history log with filters, search, sorting, and pagination
router.get(
  '/',
  authenticate,
  requireRole(['ADMIN']),
  validateRequest(listActivitiesSchema),
  activityController.listActivities
);

export default router;
