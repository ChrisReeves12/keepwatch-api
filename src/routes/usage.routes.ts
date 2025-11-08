import { Router } from 'express';
import * as UsageController from '../controllers/usage.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// GET /api/v1/usage/quota - Get current user's quota information - Requires JWT authentication
router.get('/quota', authenticate, UsageController.getUserQuota);

export default router;

