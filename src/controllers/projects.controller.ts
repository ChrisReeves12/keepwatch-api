import { Request, Response } from 'express';
import * as ProjectsService from '../services/projects.service';
import { CreateProjectInput, UpdateProjectInput } from '../types/project.types';
import * as UsersService from '../services/users.service';

/**
 * @swagger
 * /api/v1/projects:
 *   post:
 *     summary: Create a new project
 *     description: Create a new project. The authenticated user will be added as an admin.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProjectInput'
 *     responses:
 *       201:
 *         description: Project created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Project created successfully
 *                 project:
 *                   $ref: '#/components/schemas/Project'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const createProject = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const projectData: CreateProjectInput = req.body;

        // Validate required fields
        if (!projectData.name) {
            res.status(400).json({
                error: 'Missing required field: name',
            });
            return;
        }

        // Get the creator's user ID from the JWT token
        const creatorUser = await UsersService.findUserByUserId(req.user.userId);
        if (!creatorUser || !creatorUser._id) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        const project = await ProjectsService.createProject(projectData, creatorUser._id);

        res.status(201).json({
            message: 'Project created successfully',
            project,
        });
    } catch (error: any) {
        console.error('Error creating project:', error);
        res.status(500).json({
            error: 'Failed to create project',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/projects:
 *   get:
 *     summary: Get all projects for current user
 *     description: Get all projects that the authenticated user has access to
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Projects retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projects:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Project'
 *                 count:
 *                   type: number
 *                   example: 5
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const getCurrentUserProjects = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        // Get the user's Firestore _id
        const user = await UsersService.findUserByUserId(req.user.userId);
        if (!user || !user._id) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        const projects = await ProjectsService.getProjectsByUserId(user._id);

        res.json({
            projects,
            count: projects.length,
        });
    } catch (error: any) {
        console.error('Error fetching projects:', error);
        res.status(500).json({
            error: 'Failed to fetch projects',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/projects/{projectId}:
 *   get:
 *     summary: Get a project by ID
 *     description: Get a specific project by projectId. User must have access to the project.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project slug identifier
 *     responses:
 *       200:
 *         description: Project retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 project:
 *                   $ref: '#/components/schemas/Project'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - User does not have access to this project
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Project or user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const getProjectByProjectId = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { projectId } = req.params;
        const project = await ProjectsService.findProjectByProjectId(projectId);

        if (!project) {
            res.status(404).json({
                error: 'Project not found',
            });
            return;
        }

        // Check if user has access to this project
        const user = await UsersService.findUserByUserId(req.user.userId);
        if (!user || !user._id) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        const hasAccess = project.users.some(pu => pu.id === user._id);
        if (!hasAccess) {
            res.status(403).json({
                error: 'Forbidden: You do not have access to this project',
            });
            return;
        }

        res.json({
            project,
        });
    } catch (error: any) {
        console.error('Error fetching project:', error);
        res.status(500).json({
            error: 'Failed to fetch project',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/projects/{projectId}:
 *   put:
 *     summary: Update a project
 *     description: Update a project by projectId. User must be admin or editor.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project slug identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProjectInput'
 *     responses:
 *       200:
 *         description: Project updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Project updated successfully
 *                 project:
 *                   $ref: '#/components/schemas/Project'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - User does not have permission to update this project
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Project or user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const updateProject = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { projectId } = req.params;
        const updateData: UpdateProjectInput = req.body;

        const project = await ProjectsService.findProjectByProjectId(projectId);
        if (!project) {
            res.status(404).json({
                error: 'Project not found',
            });
            return;
        }

        // Check if user has permission (admin or editor)
        const user = await UsersService.findUserByUserId(req.user.userId);
        if (!user || !user._id) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        const projectUser = project.users.find(pu => pu.id === user._id);
        if (!projectUser || (projectUser.role !== 'admin' && projectUser.role !== 'editor')) {
            res.status(403).json({
                error: 'Forbidden: You do not have permission to update this project',
            });
            return;
        }

        const updatedProject = await ProjectsService.updateProject(projectId, updateData);

        if (!updatedProject) {
            res.status(404).json({
                error: 'Project not found',
            });
            return;
        }

        res.json({
            message: 'Project updated successfully',
            project: updatedProject,
        });
    } catch (error: any) {
        console.error('Error updating project:', error);
        res.status(500).json({
            error: 'Failed to update project',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/projects/{projectId}:
 *   delete:
 *     summary: Delete a project
 *     description: Delete a project by projectId. User must be admin.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project slug identifier
 *     responses:
 *       200:
 *         description: Project deleted successfully, or project not found (returns 200 with message for both cases)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Project deleted successfully
 *                   description: Either "Project deleted successfully" or "Project not found"
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Only admins can delete projects
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const deleteProject = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { projectId } = req.params;

        const project = await ProjectsService.findProjectByProjectId(projectId);
        if (!project) {
            res.status(200).json({
                message: 'Project not found',
            });
            return;
        }

        // Check if user is admin
        const user = await UsersService.findUserByUserId(req.user.userId);
        if (!user || !user._id) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        const projectUser = project.users.find(pu => pu.id === user._id);
        if (!projectUser || projectUser.role !== 'admin') {
            res.status(403).json({
                error: 'Forbidden: Only admins can delete projects',
            });
            return;
        }

        const deleted = await ProjectsService.deleteProject(projectId);

        if (!deleted) {
            res.status(200).json({
                message: 'Project not found',
            });
            return;
        }

        res.json({
            message: 'Project deleted successfully',
        });
    } catch (error: any) {
        console.error('Error deleting project:', error);
        res.status(500).json({
            error: 'Failed to delete project',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/projects/{projectId}/api-keys:
 *   post:
 *     summary: Create a new API key for a project
 *     description: Create a new API key for a project. User must be admin or editor.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project slug identifier
 *     responses:
 *       201:
 *         description: API key created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: API key created successfully
 *                 apiKey:
 *                   $ref: '#/components/schemas/ProjectApiKey'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Only admins and editors can create API keys
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Project or user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const createProjectApiKey = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { projectId } = req.params;

        const project = await ProjectsService.findProjectByProjectId(projectId);
        if (!project) {
            res.status(404).json({
                error: 'Project not found',
            });
            return;
        }

        const user = await UsersService.findUserByUserId(req.user.userId);
        if (!user || !user._id) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        // Check if the user has permission (admin or editor)
        const projectUser = project.users.find(pu => pu.id === user._id);
        if (!projectUser || (projectUser.role !== 'admin' && projectUser.role !== 'editor')) {
            res.status(403).json({
                error: 'Forbidden: Only admins and editors can create API keys',
            });
            return;
        }

        const apiKey = await ProjectsService.createProjectApiKey(projectId);

        if (!apiKey) {
            res.status(404).json({
                error: 'Project not found',
            });
            return;
        }

        res.status(201).json({
            message: 'API key created successfully',
            apiKey,
        });
    } catch (error: any) {
        console.error('Error creating API key:', error);
        res.status(500).json({
            error: 'Failed to create API key',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/projects/{projectId}/api-keys:
 *   get:
 *     summary: Get all API keys for a project
 *     description: Get all API keys for a project. User must be admin or editor.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project slug identifier
 *     responses:
 *       200:
 *         description: API keys retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 apiKeys:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ProjectApiKey'
 *                 count:
 *                   type: number
 *                   example: 3
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Only admins and editors can view API keys
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Project or user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const getProjectApiKeys = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { projectId } = req.params;

        const project = await ProjectsService.findProjectByProjectId(projectId);
        if (!project) {
            res.status(404).json({
                error: 'Project not found',
            });
            return;
        }

        // Check if user has permission (admin or editor)
        const user = await UsersService.findUserByUserId(req.user.userId);
        if (!user || !user._id) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        const projectUser = project.users.find(pu => pu.id === user._id);
        if (!projectUser || (projectUser.role !== 'admin' && projectUser.role !== 'editor')) {
            res.status(403).json({
                error: 'Forbidden: Only admins and editors can view API keys',
            });
            return;
        }

        const apiKeys = await ProjectsService.getProjectApiKeys(projectId);

        if (apiKeys === null) {
            res.status(404).json({
                error: 'Project not found',
            });
            return;
        }

        res.json({
            apiKeys,
            count: apiKeys.length,
        });
    } catch (error: any) {
        console.error('Error fetching API keys:', error);
        res.status(500).json({
            error: 'Failed to fetch API keys',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/projects/{projectId}/api-keys/{apiKeyId}:
 *   delete:
 *     summary: Delete an API key from a project
 *     description: Delete an API key from a project. User must be admin or editor.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project slug identifier
 *       - in: path
 *         name: apiKeyId
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: API key deleted successfully
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Only admins and editors can delete API keys
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Project, API key, or user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const deleteProjectApiKey = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { projectId, apiKeyId } = req.params;

        const project = await ProjectsService.findProjectByProjectId(projectId);
        if (!project) {
            res.status(404).json({
                error: 'Project not found',
            });
            return;
        }

        // Check if user has permission (admin or editor)
        const user = await UsersService.findUserByUserId(req.user.userId);
        if (!user || !user._id) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        const projectUser = project.users.find(pu => pu.id === user._id);
        if (!projectUser || (projectUser.role !== 'admin' && projectUser.role !== 'editor')) {
            res.status(403).json({
                error: 'Forbidden: Only admins and editors can delete API keys',
            });
            return;
        }

        const deleted = await ProjectsService.deleteProjectApiKey(projectId, apiKeyId);

        if (!deleted) {
            res.status(404).json({
                error: 'API key not found',
            });
            return;
        }

        res.json({
            message: 'API key deleted successfully',
        });
    } catch (error: any) {
        console.error('Error deleting API key:', error);
        res.status(500).json({
            error: 'Failed to delete API key',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/projects/{projectId}/users/{userId}/role:
 *   put:
 *     summary: Update a user's role on a project
 *     description: Update a user's role on a project. Current user must be admin on the project. Admins cannot remove their own admin role.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project slug identifier
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User Firestore document ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [viewer, editor, admin]
 *                 description: New role for the user
 *                 example: editor
 *     responses:
 *       200:
 *         description: User role updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User role updated successfully
 *                 project:
 *                   $ref: '#/components/schemas/Project'
 *       400:
 *         description: Invalid role or admins cannot remove their own admin role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Only project admins can modify user roles
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Project, user, or user membership not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const updateUserRoleOnProject = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { projectId, userId } = req.params;
        const { role } = req.body;

        // Validate that a role was provided
        if (!role) {
            res.status(400).json({
                error: 'Missing required field: role',
            });
            return;
        }

        // Validate that the role is valid
        const validRoles = ['viewer', 'editor', 'admin'];
        if (!validRoles.includes(role)) {
            res.status(400).json({
                error: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
            });
            return;
        }

        // Get the project
        const project = await ProjectsService.findProjectByProjectId(projectId);
        if (!project) {
            res.status(404).json({
                error: 'Project not found',
            });
            return;
        }

        // Get the current user
        const currentUser = await UsersService.findUserByUserId(req.user.userId);
        if (!currentUser || !currentUser._id) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        // Check if current user is admin on the project
        const currentProjectUser = project.users.find(pu => pu.id === currentUser._id);
        if (!currentProjectUser || currentProjectUser.role !== 'admin') {
            res.status(403).json({
                error: 'Forbidden: Only project admins can modify user roles',
            });
            return;
        }

        // Validate the userId (basic check that it's not empty)
        if (!userId || typeof userId !== 'string') {
            res.status(400).json({
                error: 'Invalid user ID format',
            });
            return;
        }

        // Verify the target user exists on the project
        const targetProjectUser = project.users.find(pu => pu.id === userId);
        if (!targetProjectUser) {
            res.status(404).json({
                error: 'User is not a member of this project',
            });
            return;
        }

        // Prevent admin from changing their own role
        if (currentUser._id === userId && role !== 'admin') {
            res.status(400).json({
                error: 'Admins cannot remove their own admin role',
            });
            return;
        }

        // Update the user's role
        const updatedProject = await ProjectsService.updateUserRoleOnProject(projectId, userId, role);

        if (!updatedProject) {
            res.status(404).json({
                error: 'Failed to update user role',
            });
            return;
        }

        res.json({
            message: 'User role updated successfully',
            project: updatedProject,
        });
    } catch (error: any) {
        console.error('Error updating user role:', error);
        res.status(500).json({
            error: 'Failed to update user role',
            details: error.message,
        });
    }
};

