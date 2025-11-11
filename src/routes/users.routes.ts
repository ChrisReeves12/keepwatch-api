import { Router } from 'express';
import * as UsersController from '../controllers/users.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// User routes
router.post('/', UsersController.createUser);

// Protected routes - require authentication, uses userId from JWT token
router.get('/me', authenticate, UsersController.getCurrentUser);
router.get('/me/subscription', authenticate, UsersController.getCurrentUserSubscription);
router.put('/me', authenticate, UsersController.updateCurrentUser);
router.post('/me/delete/request', authenticate, UsersController.requestAccountDeletion);
router.delete('/me', authenticate, UsersController.deleteCurrentUser);

export default router;

