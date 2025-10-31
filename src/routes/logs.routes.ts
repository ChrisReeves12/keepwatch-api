import { Router } from 'express';
import * as LogsController from '../controllers/logs.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authenticateApiKey } from '../middleware/api-key.middleware';

const router = Router();

// POST /api/v1/logs - Requires API key authentication only
router.post('/', authenticateApiKey, LogsController.createLog);

// GET /api/v1/logs - Requires API key authentication only
router.get('/', authenticateApiKey, LogsController.getLogsByProjectId);

// DELETE /api/v1/logs/:projectId - Requires JWT authentication and admin role
router.delete('/:projectId', authenticate, LogsController.purgeProjectLogs);

export default router;

