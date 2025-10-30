import { Router } from 'express';
import * as LogsController from '../controllers/logs.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All log routes require authentication
router.post('/', authenticate, LogsController.createLog);
router.get('/:projectId', authenticate, LogsController.getLogsByProjectId);

export default router;

