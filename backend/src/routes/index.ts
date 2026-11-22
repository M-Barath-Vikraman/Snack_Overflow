import { Router } from 'express';
import healthRoutes from './healthRoutes';
import authRoutes from './authRoutes';
import snackRoutes from './snackRoutes';
import activityRoutes from './activityRoutes';

const router = Router();

// Health routes
router.use('/health', healthRoutes);

// Auth routes
router.use('/auth', authRoutes);

// Snack routes
router.use('/snacks', snackRoutes);

// Activity routes (Admin only)
router.use('/activities', activityRoutes);

export default router;
