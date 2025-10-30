import { Router } from 'express';
import * as UsersController from '../controllers/users.controller';

const router = Router();

// User routes
router.post('/', UsersController.createUser);
router.get('/', UsersController.getAllUsers);
router.get('/:userId', UsersController.getUserByUserId);
router.put('/:userId', UsersController.updateUser);
router.delete('/:userId', UsersController.deleteUser);

export default router;

