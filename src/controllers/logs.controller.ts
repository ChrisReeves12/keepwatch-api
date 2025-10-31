import { Request, Response } from 'express';
import * as LogsService from '../services/logs.service';
import * as ProjectsService from '../services/projects.service';
import * as UsersService from '../services/users.service';
import { CreateLogInput } from '../types/log.types';

/**
 * @swagger
 * /api/v1/logs:
 *   post:
 *     summary: Create a new log
 *     description: Create a new log entry. Requires API key authentication via X-API-Key header.
 *     tags: [Logs]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateLogInput'
 *     responses:
 *       201:
 *         description: Log created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Log created successfully
 *                 log:
 *                   $ref: '#/components/schemas/Log'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: API key authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - API key project does not match the requested project
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

        // Insert into Firestore and index in Typesense in parallel
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
 * @swagger
 * /api/v1/logs/{projectId}:
 *   get:
 *     summary: Get logs for a project
 *     description: Get logs for a project with pagination and filtering. Requires JWT authentication. User must have access to the project.
 *     tags: [Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project slug identifier
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 50
 *         description: Number of logs per page
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *         description: Filter by log level (e.g., error, warn, info, debug)
 *       - in: query
 *         name: environment
 *         schema:
 *           type: string
 *         description: Filter by environment name
 *       - in: query
 *         name: message
 *         schema:
 *           type: string
 *         description: Search in log messages
 *     responses:
 *       200:
 *         description: Logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Log'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: number
 *                       example: 1
 *                     pageSize:
 *                       type: number
 *                       example: 50
 *                     total:
 *                       type: number
 *                       example: 100
 *                     totalPages:
 *                       type: number
 *                       example: 2
 *       400:
 *         description: Invalid pagination parameters
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

