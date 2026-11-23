import { Router } from 'express';
import { snackController } from '../controllers/snackController';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';
import { validateRequest } from '../middleware/validateMiddleware';
import { imageUploadMiddleware } from '../middleware/uploadMiddleware';
import {
  listSnacksSchema,
  snackIdParamSchema,
  createSnackSchema,
  updateSnackSchema,
  consumeSnackSchema,
  restockSnackSchema,
} from '../schemas/snackSchemas';

const router = Router();

// 1. Dashboard summary (must be before /:id)
router.get('/summary', snackController.getSummary);

// 2. List snacks with search, category/status filters, pagination, sorting
router.get(
  '/',
  optionalAuthenticate,
  validateRequest(listSnacksSchema),
  snackController.listSnacks
);

// 3. Get single snack
router.get(
  '/:id',
  optionalAuthenticate,
  validateRequest(snackIdParamSchema),
  snackController.getSnackById
);

// 4. Create snack (Admin only)
router.post(
  '/',
  authenticate,
  requireRole(['ADMIN']),
  validateRequest(createSnackSchema),
  snackController.createSnack
);

// 5. Update snack (Admin only)
router.patch(
  '/:id',
  authenticate,
  requireRole(['ADMIN']),
  validateRequest(updateSnackSchema),
  snackController.updateSnack
);

// 6. Delete snack (Admin only)
router.delete(
  '/:id',
  authenticate,
  requireRole(['ADMIN']),
  validateRequest(snackIdParamSchema),
  snackController.deleteSnack
);

// 7. Atomic snack consumption (Authenticated, Idempotency-Key header supported)
router.post(
  '/:id/consume',
  authenticate,
  validateRequest(consumeSnackSchema),
  snackController.consumeSnack
);

// 8. Restock snack (Admin only)
router.post(
  '/:id/restock',
  authenticate,
  requireRole(['ADMIN']),
  validateRequest(restockSnackSchema),
  snackController.restockSnack
);

// 9. Cast vote (Authenticated members & admins)
router.post(
  '/:id/vote',
  authenticate,
  validateRequest(snackIdParamSchema),
  snackController.castVote
);

// 10. Remove vote (Authenticated members & admins)
router.delete(
  '/:id/vote',
  authenticate,
  validateRequest(snackIdParamSchema),
  snackController.removeVote
);

// 11. Upload/replace snack image (Admin only)
router.post(
  '/:id/image',
  authenticate,
  requireRole(['ADMIN']),
  validateRequest(snackIdParamSchema),
  imageUploadMiddleware,
  snackController.uploadImage
);

// 12. Delete snack image (Admin only)
router.delete(
  '/:id/image',
  authenticate,
  requireRole(['ADMIN']),
  validateRequest(snackIdParamSchema),
  snackController.deleteImage
);

export default router;
