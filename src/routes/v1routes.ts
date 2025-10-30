import { Router } from 'express';
import * as HealthController from '../controllers/health.controller';
import usersRoutes from './users.routes';
import authRoutes from './auth.routes';
import projectsRoutes from './projects.routes';

const router = Router();

router.get('/', HealthController.getHealth);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/projects', projectsRoutes);

export default router;

