import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Authentication routes
router.post('/', AuthController.authenticate);
router.post('/google', AuthController.googleAuth);
router.post('/google/link', authenticate, AuthController.linkGoogleAccount);
router.delete('/google/unlink', authenticate, AuthController.unlinkGoogleAccount);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);
router.post('/verify-email', AuthController.verifyEmail);
router.post('/verify-email/resend', AuthController.resendVerificationEmail);
router.post('/verify-2fa', AuthController.verifyTwoFactor);

export default router;

