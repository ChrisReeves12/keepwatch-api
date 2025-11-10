import { Router } from 'express';
import * as HealthController from '../controllers/health.controller';
import usersRoutes from './users.routes';
import authRoutes from './auth.routes';
import adminAuthRoutes from './admin-auth.routes';
import systemRoutes from './system.routes';
import projectsRoutes from './projects.routes';
import logsRoutes from './logs.routes';
import usageRoutes from './usage.routes';

const router = Router();

router.get('/', HealthController.getHealth);
router.use('/auth', authRoutes);
router.use('/system/auth', adminAuthRoutes);
router.use('/system', systemRoutes);
router.use('/users', usersRoutes);
router.use('/projects', projectsRoutes);
router.use('/logs', logsRoutes);
router.use('/usage', usageRoutes);

export default router;

