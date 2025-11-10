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
router.delete('/:projectId/users/:userId', authenticate, ProjectsController.removeUserFromProject);

// Invite routes
router.post('/:projectId/invite/send', authenticate, ProjectsController.sendUserInvite);
// New public route without projectId
router.get('/invite/:inviteId', ProjectsController.verifyProjectInvite);

router.get('/invite/:inviteId/project-details', ProjectsController.getProjectByInviteDetails);

// Alarm routes
router.get('/:projectId/alarms', authenticate, ProjectsController.listProjectAlarms);
router.post('/:projectId/alarms', authenticate, ProjectsController.createProjectAlarm);
router.put('/:projectId/alarms/:alarmId', authenticate, ProjectsController.updateProjectAlarm);
router.delete('/:projectId/alarms/:alarmId', authenticate, ProjectsController.deleteProjectAlarm);
router.delete('/:projectId/alarms', authenticate, ProjectsController.deleteProjectAlarm);

export default router;

