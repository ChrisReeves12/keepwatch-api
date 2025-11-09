import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller';

const router = Router();

// Authentication routes
router.post('/', AuthController.authenticate);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);
router.post('/verify-email', AuthController.verifyEmail);
router.post('/verify-email/resend', AuthController.resendVerificationEmail);

export default router;

