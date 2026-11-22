import { Router } from 'express';
import healthRoutes from './healthRoutes';
import snackRoutes from './snackRoutes';

const router = Router();

// Health routes
router.use('/health', healthRoutes);

// Snack routes
router.use('/snacks', snackRoutes);

export default router;
