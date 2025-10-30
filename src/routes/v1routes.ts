import { Router } from 'express';
import * as HealthController from '../controllers/health.controller';
import usersRoutes from './users.routes';

const router = Router();

// Health check route
router.get('/', HealthController.getHealth);

// Users routes
router.use('/users', usersRoutes);

export default router;

