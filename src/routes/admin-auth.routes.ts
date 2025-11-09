import { Router } from "express";
import * as AdminAuthController from '../controllers/admin-auth.controller';

const router = Router();

// System-admin authentication routes
router.post('/', AdminAuthController.authenticate);

export default router;
