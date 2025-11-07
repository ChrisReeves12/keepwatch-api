import { Router } from 'express';
import * as LogsController from '../controllers/logs.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authenticateApiKey } from '../middleware/api-key.middleware';

const router = Router();

// POST /api/v1/logs - Create a new log - Requires API key authentication only
router.post('/', authenticateApiKey, LogsController.createLog);

// POST /api/v1/logs/:projectId/search - Search logs with advanced filtering - Requires JWT authentication
router.post('/:projectId/search', authenticate, LogsController.queryLogsByProjectId);

// GET /api/v1/logs/:projectId/:logId - Get a single log by ID - Requires JWT authentication
router.get('/:projectId/:logId', authenticate, LogsController.getLogById);

// GET /api/v1/logs/:projectId/:logType/environments - Get unique environments for a project and log type - Requires JWT authentication
router.get('/:projectId/:logType/environments', authenticate, LogsController.getEnvironmentsByProjectAndLogType);

// DELETE /api/v1/logs/:projectId - Purge logs - Requires JWT authentication and admin role
router.delete('/:projectId', authenticate, LogsController.purgeProjectLogs);

export default router;

