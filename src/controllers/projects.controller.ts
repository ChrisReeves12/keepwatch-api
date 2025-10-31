import { Request, Response } from 'express';
import * as ProjectsService from '../services/projects.service';
import { CreateProjectInput, UpdateProjectInput } from '../types/project.types';
import * as UsersService from '../services/users.service';

/**
 * Create a new project
 * POST /api/v1/projects
 * Protected: Requires authentication
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
 * Get all projects for the current authenticated user
 * GET /api/v1/projects
 * Protected: Requires authentication
 */
export const getCurrentUserProjects = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        // Get the user's MongoDB _id
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
 * Get a project by projectId
 * GET /api/v1/projects/:projectId
 * Protected: Requires authentication, user must be in project's users array
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
 * Update a project by projectId
 * PUT /api/v1/projects/:projectId
 * Protected: Requires authentication, user must be admin or editor
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
 * Delete a project by projectId
 * DELETE /api/v1/projects/:projectId
 * Protected: Requires authentication, user must be admin
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
            res.status(404).json({
                error: 'Project not found',
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
            res.status(404).json({
                error: 'Project not found',
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
 * Create a new API key for a project
 * POST /api/v1/projects/:projectId/api-keys
 * Protected: Requires authentication, user must be admin or editor
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
 * Get all API keys for a project
 * GET /api/v1/projects/:projectId/api-keys
 * Protected: Requires authentication, user must be admin or editor
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
 * Delete an API key from a project
 * DELETE /api/v1/projects/:projectId/api-keys/:apiKeyId
 * Protected: Requires authentication, user must be admin or editor
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
 * Update a user's role on a project
 * PUT /api/v1/projects/:projectId/users/:userId/role
 * Protected: Requires authentication, current user must be admin on the project
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

