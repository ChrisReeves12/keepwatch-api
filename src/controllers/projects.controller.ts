import { Request, Response } from 'express';
import * as ProjectsService from '../services/projects.service';
import { CreateProjectInput, UpdateProjectInput, UpdateApiKeyInput, CreateAlarmInput } from '../types/project.types';
import * as UsersService from '../services/users.service';
import validator from 'validator';

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
 *     description: Get a specific project by projectId. User must have access to the project. Returns project with owner information (ownerId, ownerName, ownerEmail).
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
 *         description: Project retrieved successfully with owner information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 project:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Project'
 *                     - type: object
 *                       properties:
 *                         ownerId:
 *                           type: string
 *                           description: Firestore document ID of the project owner
 *                         ownerName:
 *                           type: string
 *                           nullable: true
 *                           description: Name of the project owner
 *                         ownerEmail:
 *                           type: string
 *                           nullable: true
 *                           description: Email of the project owner
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

        const enrichedUsers = await Promise.all(
            project.users.map(async (projectUser) => {
                const userData = await UsersService.findUserById(projectUser.id);
                return {
                    id: projectUser.id,
                    role: projectUser.role,
                    name: userData?.name || null,
                    email: userData?.email || null,
                };
            })
        );

        // Get owner information
        const ownerData = await UsersService.findUserById(project.ownerId);

        const enrichedProject = {
            ...project,
            users: enrichedUsers,
            ownerId: project.ownerId,
            ownerName: ownerData?.name || null,
            ownerEmail: ownerData?.email || null,
        };

        res.json({
            project: enrichedProject,
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

/**
 * @swagger
 * /api/v1/projects/{projectId}/api-keys/{apiKeyId}:
 *   put:
 *     summary: Update a project's API key configuration
 *     description: Update an API key's constraints (IP restrictions, referer, rate limits, etc.). User must be admin or editor.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               constraints:
 *                 type: object
 *                 properties:
 *                   ipRestrictions:
 *                     type: object
 *                     properties:
 *                       allowedIps:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["192.168.1.1", "10.0.0.0/8"]
 *                   refererRestrictions:
 *                     type: object
 *                     properties:
 *                       allowedReferers:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["https://example.com/*"]
 *                   rateLimits:
 *                     type: object
 *                     properties:
 *                       requestsPerMinute:
 *                         type: number
 *                         example: 100
 *                       requestsPerHour:
 *                         type: number
 *                         example: 5000
 *                       requestsPerDay:
 *                         type: number
 *                         example: 100000
 *                   expirationDate:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-12-31T23:59:59Z"
 *                   allowedEnvironments:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: ["production", "staging"]
 *                   originRestrictions:
 *                     type: object
 *                     properties:
 *                       allowedOrigins:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["https://app.example.com"]
 *                   userAgentRestrictions:
 *                     type: object
 *                     properties:
 *                       allowedPatterns:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["^MyApp\\/.*"]
 *           examples:
 *             ipRestriction:
 *               summary: IP address restrictions
 *               value:
 *                 constraints:
 *                   ipRestrictions:
 *                     allowedIps: ["192.168.1.100", "10.0.0.0/24"]
 *             refererRestriction:
 *               summary: HTTP Referer restrictions
 *               value:
 *                 constraints:
 *                   refererRestrictions:
 *                     allowedReferers: ["https://myapp.com/*", "https://*.myapp.com/*"]
 *             multipleConstraints:
 *               summary: Multiple constraints
 *               value:
 *                 constraints:
 *                   ipRestrictions:
 *                     allowedIps: ["192.168.1.0/24"]
 *                   allowedEnvironments: ["production"]
 *                   expirationDate: "2025-12-31T23:59:59Z"
 *     responses:
 *       200:
 *         description: API key updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: API key updated successfully
 *                 apiKey:
 *                   $ref: '#/components/schemas/ProjectApiKey'
 *       400:
 *         description: Invalid constraint configuration
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
 *         description: Forbidden - Only admins and editors can update API keys
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
export const updateProjectApiKey = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { projectId, apiKeyId } = req.params;
        const updateData: UpdateApiKeyInput = req.body;

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

        // Check if user has permission (admin or editor)
        const projectUser = project.users.find(pu => pu.id === currentUser._id);
        if (!projectUser || (projectUser.role !== 'admin' && projectUser.role !== 'editor')) {
            res.status(403).json({
                error: 'Forbidden: Only admins and editors can update API keys',
            });
            return;
        }

        // Update the API key
        const updatedApiKey = await ProjectsService.updateApiKey(projectId, apiKeyId, updateData);

        if (!updatedApiKey) {
            res.status(404).json({
                error: 'API key not found',
            });
            return;
        }

        res.json({
            message: 'API key updated successfully',
            apiKey: updatedApiKey,
        });
    } catch (error: any) {
        console.error('Error updating API key:', error);

        // Check if it's a validation error
        if (error.message && typeof error.message === 'string') {
            res.status(400).json({
                error: 'Invalid constraint configuration',
                details: error.message,
            });
            return;
        }

        res.status(500).json({
            error: 'Failed to update API key',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/projects/{projectId}/users/{userId}:
 *   delete:
 *     summary: Remove a user from a project
 *     description: Remove a user from a project. Current user must be admin on the project. Admins cannot remove themselves. The project owner cannot be removed.
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
 *     responses:
 *       200:
 *         description: User removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User removed from project successfully
 *                 project:
 *                   $ref: '#/components/schemas/Project'
 *       400:
 *         description: Admins cannot remove themselves, or the project owner cannot be removed
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
 *         description: Forbidden - Only project admins can remove users
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
export const removeUserFromProject = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { projectId, userId } = req.params;

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
                error: 'Forbidden: Only project admins can remove users',
            });
            return;
        }

        // Prevent admin from removing themselves
        if (currentUser._id === userId) {
            res.status(400).json({
                error: 'Admins cannot remove themselves from the project',
            });
            return;
        }

        // Prevent removal of the project owner
        if (project.ownerId === userId) {
            res.status(400).json({
                error: 'The project owner cannot be removed from the project',
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

        // Remove the user
        const updatedProject = await ProjectsService.removeUserFromProject(projectId, userId);

        if (!updatedProject) {
            res.status(404).json({
                error: 'Failed to remove user from project',
            });
            return;
        }

        res.json({
            message: 'User removed from project successfully',
            project: updatedProject,
        });
    } catch (error: any) {
        console.error('Error removing user from project:', error);
        res.status(500).json({
            error: 'Failed to remove user from project',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/projects/{projectId}/alarms:
 *   get:
 *     summary: Get all alarms for a project
 *     description: Get all alarms for a project. User must have access to the project.
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
 *         description: Alarms retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 alarms:
 *                   type: array
 *                   items:
 *                     type: object
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
export const listProjectAlarms = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { projectId } = req.params;

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

        // Check if user has access to this project (any role)
        const projectUser = project.users.find(pu => pu.id === currentUser._id);
        if (!projectUser) {
            res.status(403).json({
                error: 'Forbidden: You do not have access to this project',
            });
            return;
        }

        // Get the alarms
        const alarms = await ProjectsService.getProjectAlarms(projectId);

        if (alarms === null) {
            res.status(404).json({
                error: 'Project not found',
            });
            return;
        }

        res.json({
            alarms,
            count: alarms.length,
        });
    } catch (error: any) {
        console.error('Error fetching alarms:', error);
        res.status(500).json({
            error: 'Failed to fetch alarms',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/projects/{projectId}/alarms:
 *   post:
 *     summary: Create a project alarm
 *     description: Create a new alarm for a project. If an alarm with the same message, level, environment, and logType exists, its delivery methods will be updated. User must be admin or editor.
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
 *             type: object
 *             required:
 *               - logType
 *               - level
 *               - environment
 *               - deliveryMethods
 *             properties:
 *               logType:
 *                 type: string
 *                 enum: [Application Log, System Log]
 *                 example: Application Log
 *               message:
 *                 type: string
 *                 nullable: true
 *                 description: Message pattern to match (use null/undefined to match any message)
 *                 example: High CPU usage detected
 *               level:
 *                 oneOf:
 *                   - type: string
 *                     enum: [INFO, DEBUG, WARNING, ERROR, CRITICAL]
 *                   - type: array
 *                     items:
 *                       type: string
 *                       enum: [INFO, DEBUG, WARNING, ERROR, CRITICAL]
 *                 description: Log level(s) to match - can be a single string or array of strings
 *                 example: ERROR
 *               environment:
 *                 type: string
 *                 example: production
 *               deliveryMethods:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: object
 *                     properties:
 *                       addresses:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["alert@example.com"]
 *                   slack:
 *                     type: object
 *                     properties:
 *                       webhook:
 *                         type: string
 *                         example: https://hooks.slack.com/services/...
 *                   webhook:
 *                     type: object
 *                     properties:
 *                       url:
 *                         type: string
 *                         example: https://your-api.com/webhook
 *     responses:
 *       201:
 *         description: Alarm created successfully, or delivery methods updated if matching alarm exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Alarm created successfully
 *                   description: Returns "Alarm created successfully" or "Alarm delivery methods updated successfully"
 *                 alarm:
 *                   type: object
 *                   description: The created or updated alarm with its ID
 *       400:
 *         description: Invalid request body
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
 *         description: Forbidden - Only admins and editors can create alarms
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
export const createProjectAlarm = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { projectId } = req.params;
        const alarmData: CreateAlarmInput = req.body;

        // Validate required fields
        if (!alarmData.logType) {
            res.status(400).json({
                error: 'Missing required field: logType',
            });
            return;
        }

        // Empty message means "match all"
        if (!alarmData.message) {
            alarmData.message = undefined;
        }

        if (!alarmData.level) {
            res.status(400).json({
                error: 'Missing required field: level',
            });
            return;
        }

        if (!alarmData.environment || typeof alarmData.environment !== 'string' || !alarmData.environment.trim()) {
            res.status(400).json({
                error: 'Missing or invalid required field: environment',
            });
            return;
        }

        if (!alarmData.deliveryMethods || typeof alarmData.deliveryMethods !== 'object') {
            res.status(400).json({
                error: 'Missing or invalid required field: deliveryMethods',
            });
            return;
        }

        // Validate logType
        const validLogTypes = ['application', 'system'];
        if (!validLogTypes.includes(alarmData.logType)) {
            res.status(400).json({
                error: `Invalid logType. Must be one of: ${validLogTypes.join(', ')}`,
            });
            return;
        }

        // Validate level (supports both string and array)
        const validLevels = ['INFO', 'DEBUG', 'WARNING', 'ERROR', 'CRITICAL'];
        if (Array.isArray(alarmData.level)) {
            // Validate array of levels
            if (alarmData.level.length === 0) {
                res.status(400).json({
                    error: 'Level array cannot be empty',
                });
                return;
            }
            for (const level of alarmData.level) {
                if (!validLevels.includes(level)) {
                    res.status(400).json({
                        error: `Invalid level: ${level}. Each level must be one of: ${validLevels.join(', ')}`,
                    });
                    return;
                }
            }
        } else if (typeof alarmData.level === 'string') {
            // Validate single level
            if (!validLevels.includes(alarmData.level)) {
                res.status(400).json({
                    error: `Invalid level. Must be one of: ${validLevels.join(', ')}`,
                });
                return;
            }
        } else {
            res.status(400).json({
                error: 'Invalid level. Must be a string or array of strings',
            });
            return;
        }

        // Validate delivery methods - at least one must be present
        const { email, slack, webhook } = alarmData.deliveryMethods;
        if (!email && !slack && !webhook) {
            res.status(400).json({
                error: 'At least one delivery method must be specified (email, slack, or webhook)',
            });
            return;
        }

        // Validate email if present
        if (email) {
            if (!email.addresses || !Array.isArray(email.addresses) || email.addresses.length === 0) {
                res.status(400).json({
                    error: 'Email delivery method requires at least one email address',
                });
                return;
            }

            // Validate each email address
            for (const emailAddress of email.addresses) {
                if (!validator.isEmail(emailAddress)) {
                    res.status(400).json({
                        error: `Invalid email address: ${emailAddress}`,
                    });
                    return;
                }
            }
        }

        // Validate slack if present
        if (slack) {
            if (!slack.webhook || typeof slack.webhook !== 'string' || !slack.webhook.trim()) {
                res.status(400).json({
                    error: 'Slack delivery method requires a webhook URL',
                });
                return;
            }
        }

        // Validate webhook if present
        if (webhook) {
            if (!webhook.url || typeof webhook.url !== 'string' || !webhook.url.trim()) {
                res.status(400).json({
                    error: 'Webhook delivery method requires a URL',
                });
                return;
            }
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

        // Check if user has permission (admin or editor)
        const projectUser = project.users.find(pu => pu.id === currentUser._id);
        if (!projectUser || (projectUser.role !== 'admin' && projectUser.role !== 'editor')) {
            res.status(403).json({
                error: 'Forbidden: Only admins and editors can create alarms',
            });
            return;
        }

        // Add the alarm to the project (or update if matching alarm exists)
        const result = await ProjectsService.addAlarmToProject(projectId, alarmData);

        if (!result.project) {
            res.status(404).json({
                error: 'Project not found',
            });
            return;
        }

        // Find the alarm in the response
        let alarm;
        if (result.added && result.project.alarms) {
            // New alarm was created - get the last one added
            alarm = result.project.alarms[result.project.alarms.length - 1];
        } else if (result.updated && result.project.alarms) {
            // Existing alarm was updated - find it by matching fields
            alarm = result.project.alarms.find(a => {
                // Compare levels (handle both string and array)
                const levelsMatch = (() => {
                    const aLevel = a.level;
                    const dataLevel = alarmData.level;

                    // Both arrays
                    if (Array.isArray(aLevel) && Array.isArray(dataLevel)) {
                        return aLevel.length === dataLevel.length &&
                            aLevel.every(l => dataLevel.includes(l));
                    }

                    // Both strings
                    if (typeof aLevel === 'string' && typeof dataLevel === 'string') {
                        return aLevel.toLowerCase() === dataLevel.toLowerCase();
                    }

                    // Different types
                    return false;
                })();

                // Compare messages (handle null which means "match any message")
                const messagesMatch = (() => {
                    // Both empty
                    if (!a.message && !alarmData.message) {
                        return true;
                    }

                    // One null, one not
                    if (!a.message || !alarmData.message) {
                        return false;
                    }

                    // Both strings
                    return String(a.message).toLowerCase() === String(alarmData.message).toLowerCase();
                })();

                return messagesMatch &&
                    a.environment.toLowerCase() === alarmData.environment.toLowerCase() &&
                    a.logType.toLowerCase() === alarmData.logType.toLowerCase() &&
                    levelsMatch;
            });
        }

        res.status(201).json({
            message: result.added
                ? 'Alarm created successfully'
                : result.updated
                    ? 'Alarm delivery methods updated successfully'
                    : 'Alarm already exists',
            alarm,
        });
    } catch (error: any) {
        console.error('Error creating alarm:', error);
        res.status(500).json({
            error: 'Failed to create alarm',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/projects/{projectId}/alarms/{alarmId}:
 *   put:
 *     summary: Update a project alarm
 *     description: Update an existing alarm by its ID. User must be admin or editor.
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
 *         name: alarmId
 *         required: true
 *         schema:
 *           type: string
 *         description: Alarm ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - logType
 *               - level
 *               - environment
 *               - deliveryMethods
 *             properties:
 *               logType:
 *                 type: string
 *                 enum: [Application Log, System Log]
 *                 example: Application Log
 *               message:
 *                 type: string
 *                 nullable: true
 *                 description: Message pattern to match (use null to match any message)
 *                 example: High CPU usage detected
 *               level:
 *                 oneOf:
 *                   - type: string
 *                     enum: [INFO, DEBUG, WARNING, ERROR, CRITICAL]
 *                   - type: array
 *                     items:
 *                       type: string
 *                       enum: [INFO, DEBUG, WARNING, ERROR, CRITICAL]
 *                 description: Log level(s) to match - can be a single string or array of strings
 *                 example: ERROR
 *               environment:
 *                 type: string
 *                 example: production
 *               deliveryMethods:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: object
 *                     properties:
 *                       addresses:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["alert@example.com"]
 *                   slack:
 *                     type: object
 *                     properties:
 *                       webhook:
 *                         type: string
 *                         example: https://hooks.slack.com/services/...
 *                   webhook:
 *                     type: object
 *                     properties:
 *                       url:
 *                         type: string
 *                         example: https://your-api.com/webhook
 *     responses:
 *       200:
 *         description: Alarm updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Alarm updated successfully
 *                 alarm:
 *                   type: object
 *                   description: The updated alarm
 *       400:
 *         description: Invalid request body
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
 *         description: Forbidden - Only admins and editors can update alarms
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Project, user, or alarm not found
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
export const updateProjectAlarm = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { projectId, alarmId } = req.params;
        const alarmData: CreateAlarmInput = req.body;

        // Validate required fields (same as create)
        if (!alarmData.logType) {
            res.status(400).json({
                error: 'Missing required field: logType',
            });
            return;
        }

        // Message can be a string or null (null means "match any message")
        if (alarmData.message !== null && (typeof alarmData.message !== 'string' || !alarmData.message.trim())) {
            res.status(400).json({
                error: 'Invalid message field: must be a non-empty string or null',
            });
            return;
        }

        if (!alarmData.level) {
            res.status(400).json({
                error: 'Missing required field: level',
            });
            return;
        }

        if (!alarmData.environment || typeof alarmData.environment !== 'string' || !alarmData.environment.trim()) {
            res.status(400).json({
                error: 'Missing or invalid required field: environment',
            });
            return;
        }

        if (!alarmData.deliveryMethods || typeof alarmData.deliveryMethods !== 'object') {
            res.status(400).json({
                error: 'Missing or invalid required field: deliveryMethods',
            });
            return;
        }

        // Validate logType
        const validLogTypes = ['application', 'system'];
        if (!validLogTypes.includes(alarmData.logType)) {
            res.status(400).json({
                error: `Invalid logType. Must be one of: ${validLogTypes.join(', ')}`,
            });
            return;
        }

        // Validate level (supports both string and array)
        const validLevels = ['INFO', 'DEBUG', 'WARNING', 'ERROR', 'CRITICAL'];
        if (Array.isArray(alarmData.level)) {
            // Validate array of levels
            if (alarmData.level.length === 0) {
                res.status(400).json({
                    error: 'Level array cannot be empty',
                });
                return;
            }
            for (const level of alarmData.level) {
                if (!validLevels.includes(level)) {
                    res.status(400).json({
                        error: `Invalid level: ${level}. Each level must be one of: ${validLevels.join(', ')}`,
                    });
                    return;
                }
            }
        } else if (typeof alarmData.level === 'string') {
            // Validate single level
            if (!validLevels.includes(alarmData.level)) {
                res.status(400).json({
                    error: `Invalid level. Must be one of: ${validLevels.join(', ')}`,
                });
                return;
            }
        } else {
            res.status(400).json({
                error: 'Invalid level. Must be a string or array of strings',
            });
            return;
        }

        // Validate delivery methods - at least one must be present
        const { email, slack, webhook } = alarmData.deliveryMethods;
        if (!email && !slack && !webhook) {
            res.status(400).json({
                error: 'At least one delivery method must be specified (email, slack, or webhook)',
            });
            return;
        }

        // Validate email if present
        if (email) {
            if (!email.addresses || !Array.isArray(email.addresses) || email.addresses.length === 0) {
                res.status(400).json({
                    error: 'Email delivery method requires at least one email address',
                });
                return;
            }

            // Validate each email address
            for (const emailAddress of email.addresses) {
                if (!validator.isEmail(emailAddress)) {
                    res.status(400).json({
                        error: `Invalid email address: ${emailAddress}`,
                    });
                    return;
                }
            }
        }

        // Validate slack if present
        if (slack) {
            if (!slack.webhook || typeof slack.webhook !== 'string' || !slack.webhook.trim()) {
                res.status(400).json({
                    error: 'Slack delivery method requires a webhook URL',
                });
                return;
            }
        }

        // Validate webhook if present
        if (webhook) {
            if (!webhook.url || typeof webhook.url !== 'string' || !webhook.url.trim()) {
                res.status(400).json({
                    error: 'Webhook delivery method requires a URL',
                });
                return;
            }
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

        // Check if user has permission (admin or editor)
        const projectUser = project.users.find(pu => pu.id === currentUser._id);
        if (!projectUser || (projectUser.role !== 'admin' && projectUser.role !== 'editor')) {
            res.status(403).json({
                error: 'Forbidden: Only admins and editors can update alarms',
            });
            return;
        }

        // Update the alarm
        const updatedAlarm = await ProjectsService.updateAlarmById(projectId, alarmId, alarmData);

        if (!updatedAlarm) {
            res.status(404).json({
                error: 'Alarm not found',
            });
            return;
        }

        res.json({
            message: 'Alarm updated successfully',
            alarm: updatedAlarm,
        });
    } catch (error: any) {
        console.error('Error updating alarm:', error);
        res.status(500).json({
            error: 'Failed to update alarm',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/projects/{projectId}/alarms/{alarmId}:
 *   delete:
 *     summary: Delete a project alarm or all alarms
 *     description: Delete a specific alarm by ID, or delete all alarms if no ID is provided. User must be admin or editor.
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
 *         name: alarmId
 *         required: false
 *         schema:
 *           type: string
 *         description: Alarm ID to delete. If not provided, all alarms will be deleted.
 *     responses:
 *       200:
 *         description: Alarm(s) deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Alarm deleted successfully
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Only admins and editors can delete alarms
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Project, user, or alarm not found
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
export const deleteProjectAlarm = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { projectId, alarmId } = req.params;

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

        // Check if user has permission (admin or editor)
        const projectUser = project.users.find(pu => pu.id === currentUser._id);
        if (!projectUser || (projectUser.role !== 'admin' && projectUser.role !== 'editor')) {
            res.status(403).json({
                error: 'Forbidden: Only admins and editors can delete alarms',
            });
            return;
        }

        // Delete the alarm(s)
        const deleted = await ProjectsService.deleteProjectAlarm(projectId, alarmId);

        if (!deleted) {
            if (alarmId) {
                res.status(404).json({
                    error: 'Alarm not found',
                });
            } else {
                res.status(404).json({
                    error: 'Project not found',
                });
            }
            return;
        }

        res.json({
            message: alarmId ? 'Alarm deleted successfully' : 'All alarms deleted successfully',
        });
    } catch (error: any) {
        console.error('Error deleting alarm:', error);
        res.status(500).json({
            error: 'Failed to delete alarm',
            details: error.message,
        });
    }
};

