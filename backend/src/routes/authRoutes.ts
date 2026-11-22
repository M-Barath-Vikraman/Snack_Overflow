import { Router } from 'express';
import { registerHandler, loginHandler } from '../controllers/authController';
import { validateRequest } from '../middleware/validateMiddleware';
import { registerSchema, loginSchema } from '../schemas/authSchemas';

const router = Router();

router.post('/register', validateRequest(registerSchema), registerHandler);
router.post('/login', validateRequest(loginSchema), loginHandler);

export default router;
