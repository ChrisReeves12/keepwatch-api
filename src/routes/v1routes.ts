import { Router } from 'express';
import * as HealthController from '../controllers/health.controller';
import usersRoutes from './users.routes';
import authRoutes from './auth.routes';

const router = Router();

router.get('/', HealthController.getHealth);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);

export default router;

