import { Router } from 'express';
import * as LogsController from '../controllers/logs.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authenticateApiKey } from '../middleware/api-key.middleware';

const router = Router();

// POST /api/v1/logs - Requires API key authentication only
router.post('/', authenticateApiKey, LogsController.createLog);

// GET /api/v1/logs/:projectId - Requires JWT authentication only
router.get('/:projectId', authenticate, LogsController.getLogsByProjectId);

export default router;

