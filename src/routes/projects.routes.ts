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

export default router;

