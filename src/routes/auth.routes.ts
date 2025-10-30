import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller';

const router = Router();

// Authentication routes
router.post('/authenticate', AuthController.authenticate);

export default router;

