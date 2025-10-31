import { Request, Response } from 'express';
import * as LogsService from '../services/logs.service';
import * as ProjectsService from '../services/projects.service';
import * as UsersService from '../services/users.service';
import { CreateLogInput } from '../types/log.types';

/**
 * Create a new log
 * POST /api/v1/logs
 * Protected: Requires API key authentication
 */
export const createLog = async (req: Request, res: Response): Promise<void> => {
    try {
        // Verify API key authentication
        if (!req.apiKeyProject) {
            res.status(401).json({
                error: 'API key authentication required',
            });
            return;
        }

        const logData: CreateLogInput = req.body;

        // Validate required fields
        if (!logData.level || !logData.environment || !logData.projectId || !logData.message || logData.timestampMS === undefined) {
            res.status(400).json({
                error: 'Missing required fields: level, environment, projectId, message, timestampMS',
            });
            return;
        }

        // Use the project from the API key
        const project = req.apiKeyProject;

        // Verify the projectId in the request matches the API key's project
        if (logData.projectId !== project.projectId) {
            res.status(403).json({
                error: 'Forbidden: API key project does not match the requested project',
            });
            return;
        }

        // Insert into MongoDB and index in Typesense in parallel
        const [log] = await Promise.all([
            LogsService.createLog(logData),
            LogsService.indexLogInSearch(logData),
        ]);

        res.status(201).json({
            message: 'Log created successfully',
            log,
        });
    } catch (error: any) {
        console.error('Error creating log:', error);
        res.status(500).json({
            error: 'Failed to create log',
            details: error.message,
        });
    }
};

/**
 * Get logs for a project
 * GET /api/v1/logs/:projectId
 * Protected: Requires JWT authentication
 */
export const getLogsByProjectId = async (req: Request, res: Response): Promise<void> => {
    try {
        // Verify JWT authentication
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { projectId } = req.params;

        // Parse query parameters
        const pageParam = req.query.page as string | undefined;
        const pageSizeParam = req.query.pageSize as string | undefined;
        const page = pageParam ? parseInt(pageParam) : 1;
        const pageSize = pageSizeParam ? parseInt(pageSizeParam) : 50;
        const level = req.query.level as string | undefined;
        const environment = req.query.environment as string | undefined;
        const message = req.query.message as string | undefined;

        // Validate page and pageSize
        if (isNaN(page) || page < 1) {
            res.status(400).json({
                error: 'Page must be greater than 0',
            });
            return;
        }

        if (isNaN(pageSize) || pageSize < 1 || pageSize > 1000) {
            res.status(400).json({
                error: 'Page size must be between 1 and 1000',
            });
            return;
        }

        // Verify project exists and user has access
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

        const result = await LogsService.getLogsByProjectId(projectId, page, pageSize, level, environment, message);

        res.json({
            logs: result.logs,
            pagination: {
                page: result.page,
                pageSize: result.pageSize,
                total: result.total,
                totalPages: result.totalPages,
            },
        });
    } catch (error: any) {
        console.error('Error fetching logs:', error);
        res.status(500).json({
            error: 'Failed to fetch logs',
            details: error.message,
        });
    }
};

