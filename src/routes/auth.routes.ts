import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller';

const router = Router();

// Authentication routes
router.post('/', AuthController.authenticate);

export default router;

