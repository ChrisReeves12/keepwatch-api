import { Router } from 'express';
import * as ProjectsController from '../controllers/projects.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All project routes require authentication
router.post('/', authenticate, ProjectsController.createProject);
router.get('/', authenticate, ProjectsController.getCurrentUserProjects);
router.get('/:projectId', authenticate, ProjectsController.getProjectByProjectId);
router.put('/:projectId', authenticate, ProjectsController.updateProject);
router.delete('/:projectId', authenticate, ProjectsController.deleteProject);

// API key routes
router.post('/:projectId/api-keys', authenticate, ProjectsController.createProjectApiKey);
router.get('/:projectId/api-keys', authenticate, ProjectsController.getProjectApiKeys);
router.put('/:projectId/api-keys/:apiKeyId', authenticate, ProjectsController.updateProjectApiKey);
router.delete('/:projectId/api-keys/:apiKeyId', authenticate, ProjectsController.deleteProjectApiKey);

// User role routes
router.put('/:projectId/users/:userId/role', authenticate, ProjectsController.updateUserRoleOnProject);

export default router;

