import { Request, Response } from 'express';
import * as LogsService from '../services/logs.service';
import * as ProjectsService from '../services/projects.service';
import * as UsersService from '../services/users.service';
import { CreateLogInput, QueryLogsRequest } from '../types/log.types';

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
        if (!logData.level || !logData.environment || !logData.projectId || !logData.message) {
            res.status(400).json({
                error: 'Missing required fields: level, environment, projectId, message',
            });
            return;
        }

        // Generate timestamp if not provided
        if (logData.timestampMS === undefined) {
            logData.timestampMS = Date.now();
        }

        // Generate detailString from details
        if (!logData.details || Object.keys(logData.details).length === 0) {
            logData.detailString = null;
        } else {
            logData.detailString = JSON.stringify(logData.details);
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
 * /api/v1/logs/{projectId}/search:
 *   post:
 *     summary: Search logs for a project
 *     description: Search logs for a project with pagination and advanced filtering. Requires JWT authentication via Bearer token. The user must be a member of the project. Supports advanced filtering on message, stack trace, and details with contains/startsWith/endsWith and AND/OR logic.
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
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page:
 *                 type: integer
 *                 minimum: 1
 *                 default: 1
 *                 description: Page number for pagination
 *               pageSize:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 1000
 *                 default: 50
 *                 description: Number of logs per page
 *               level:
 *                 type: string
 *                 description: Filter by log level (e.g., error, warn, info, debug)
 *               environment:
 *                 type: string
 *                 description: Filter by environment name
 *               message:
 *                 type: object
 *                 description: Advanced message filter with AND/OR logic
 *                 properties:
 *                   operator:
 *                     type: string
 *                     enum: [AND, OR]
 *                     description: Logical operator to combine conditions
 *                   conditions:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         phrase:
 *                           type: string
 *                           description: The text to search for
 *                         matchType:
 *                           type: string
 *                           enum: [contains, startsWith, endsWith]
 *                           description: Type of match to perform
 *               stackTrace:
 *                 type: object
 *                 description: Advanced stack trace filter with AND/OR logic
 *                 properties:
 *                   operator:
 *                     type: string
 *                     enum: [AND, OR]
 *                     description: Logical operator to combine conditions
 *                   conditions:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         phrase:
 *                           type: string
 *                           description: The text to search for in stack trace
 *                         matchType:
 *                           type: string
 *                           enum: [contains, startsWith, endsWith]
 *                           description: Type of match to perform
 *               details:
 *                 type: object
 *                 description: Advanced details filter with AND/OR logic
 *                 properties:
 *                   operator:
 *                     type: string
 *                     enum: [AND, OR]
 *                     description: Logical operator to combine conditions
 *                   conditions:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         phrase:
 *                           type: string
 *                           description: The text to search for in details
 *                         matchType:
 *                           type: string
 *                           enum: [contains, startsWith, endsWith]
 *                           description: Type of match to perform
 *           examples:
 *             simpleQuery:
 *               summary: Simple query with pagination
 *               value:
 *                 page: 1
 *                 pageSize: 50
 *                 level: error
 *                 environment: production
 *             messageFilterAnd:
 *               summary: Message filter with AND logic
 *               value:
 *                 page: 1
 *                 pageSize: 50
 *                 messageFilter:
 *                   operator: AND
 *                   conditions:
 *                     - phrase: "database"
 *                       matchType: "contains"
 *                     - phrase: "error"
 *                       matchType: "contains"
 *             messageFilterOr:
 *               summary: Message filter with OR logic
 *               value:
 *                 page: 1
 *                 pageSize: 50
 *                 messageFilter:
 *                   operator: OR
 *                   conditions:
 *                     - phrase: "Connection"
 *                       matchType: "startsWith"
 *                     - phrase: "timeout"
 *                       matchType: "endsWith"
 *             stackTraceFilter:
 *               summary: Stack trace filter example
 *               value:
 *                 page: 1
 *                 pageSize: 50
 *                 stackTrace:
 *                   operator: AND
 *                   conditions:
 *                     - phrase: "TypeError"
 *                       matchType: "contains"
 *                     - phrase: "at line"
 *                       matchType: "contains"
 *             detailsFilter:
 *               summary: Details filter example
 *               value:
 *                 page: 1
 *                 pageSize: 50
 *                 details:
 *                   operator: OR
 *                   conditions:
 *                     - phrase: "userId"
 *                       matchType: "contains"
 *                     - phrase: "requestId"
 *                       matchType: "contains"
 *             combinedFilters:
 *               summary: Combined filters example
 *               value:
 *                 page: 1
 *                 pageSize: 50
 *                 level: error
 *                 messageFilter:
 *                   operator: AND
 *                   conditions:
 *                     - phrase: "failed"
 *                       matchType: "contains"
 *                 stackTrace:
 *                   operator: OR
 *                   conditions:
 *                     - phrase: "TypeError"
 *                       matchType: "contains"
 *                     - phrase: "ReferenceError"
 *                       matchType: "contains"
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
 *         description: Invalid request parameters
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
export const queryLogsByProjectId = async (req: Request, res: Response): Promise<void> => {
    try {
        // Verify JWT authentication
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        // Get projectId from path params
        const { projectId } = req.params;
        if (!projectId) {
            res.status(400).json({
                error: 'Missing required path parameter: projectId',
            });
            return;
        }

        // Verify project exists
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

        // Check if current user is a member of the project (any role)
        const currentProjectUser = project.users.find(pu => pu.id === currentUser._id);
        if (!currentProjectUser) {
            res.status(403).json({
                error: 'Forbidden: You do not have access to this project',
            });
            return;
        }

        // Parse request body
        const requestBody: QueryLogsRequest = req.body || {};
        const page = requestBody.page ?? 1;
        const pageSize = requestBody.pageSize ?? 50;
        const level = requestBody.level;
        const environment = requestBody.environment;
        const messageFilter = requestBody.message;
        const stackTraceFilter = requestBody.stackTrace;
        const detailsFilter = requestBody.details;

        // Validate page and pageSize
        if (page < 1) {
            res.status(400).json({
                error: 'Page must be a number greater than 0',
            });
            return;
        }

        if (pageSize < 1 || pageSize > 1000) {
            res.status(400).json({
                error: 'Page size must be a number between 1 and 1000',
            });
            return;
        }

        // Helper function to validate a filter
        const validateFilter = (filter: any, filterName: string): string | null => {
            if (!filter.operator || !['AND', 'OR'].includes(filter.operator)) {
                return `${filterName}.operator must be either "AND" or "OR"`;
            }

            if (!Array.isArray(filter.conditions) || filter.conditions.length === 0) {
                return `${filterName}.conditions must be a non-empty array`;
            }

            // Validate each condition
            for (const condition of filter.conditions) {
                if (!condition.phrase || typeof condition.phrase !== 'string') {
                    return `Each condition in ${filterName} must have a non-empty phrase string`;
                }

                if (!condition.matchType || !['contains', 'startsWith', 'endsWith'].includes(condition.matchType)) {
                    return `Each condition in ${filterName} must have a matchType of "contains", "startsWith", or "endsWith"`;
                }
            }

            return null;
        };

        // Validate messageFilter if provided
        if (messageFilter) {
            const error = validateFilter(messageFilter, 'messageFilter');
            if (error) {
                res.status(400).json({ error });
                return;
            }
        }

        // Validate stackTrace filter if provided
        if (stackTraceFilter) {
            const error = validateFilter(stackTraceFilter, 'stackTrace');
            if (error) {
                res.status(400).json({ error });
                return;
            }
        }

        // Validate details filter if provided
        if (detailsFilter) {
            const error = validateFilter(detailsFilter, 'details');
            if (error) {
                res.status(400).json({ error });
                return;
            }
        }

        const result = await LogsService.getLogsByProjectId(projectId, page, pageSize, level, environment, messageFilter, stackTraceFilter, detailsFilter);

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

/**
 * @swagger
 * /api/v1/logs/{projectId}:
 *   delete:
 *     summary: Purge logs for a project
 *     description: Delete logs for a project with optional filters. Only admins can delete logs. Supports filtering by time range, lookback time, environment, and level.
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
 *         name: lookbackTime
 *         schema:
 *           type: string
 *         description: Delete logs older than this lookback time (e.g., "5d", "2h", "10m", "3months")
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *         description: Delete logs within this time range (e.g., "2024-01-01 to 2024-01-31" or "2024-01-01-12:00:00 to 2024-01-31-23:59:59")
 *       - in: query
 *         name: env
 *         schema:
 *           type: string
 *         description: Filter by environment name
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *         description: Filter by log level (e.g., error, warn, info, debug)
 *     responses:
 *       200:
 *         description: Logs purged successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logs purged successfully
 *                 deletedCount:
 *                   type: number
 *                   example: 150
 *       400:
 *         description: Invalid query parameters
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
 *         description: Forbidden - Only project admins can delete logs
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
export const purgeProjectLogs = async (req: Request, res: Response): Promise<void> => {
    try {
        // Verify JWT authentication
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        // Get projectId from path params
        const { projectId } = req.params;
        if (!projectId) {
            res.status(400).json({
                error: 'Missing required path parameter: projectId',
            });
            return;
        }

        // Verify project exists
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
                error: 'Forbidden: Only project admins can delete logs',
            });
            return;
        }

        // Parse query parameters
        const lookbackTime = req.query.lookbackTime as string | undefined;
        const timeRange = req.query.timeRange as string | undefined;
        const env = req.query.env as string | undefined;
        const level = req.query.level as string | undefined;

        // Validate that both lookbackTime and timeRange are not provided
        if (lookbackTime && timeRange) {
            res.status(400).json({
                error: 'Cannot specify both lookbackTime and timeRange. Please use only one.',
            });
            return;
        }

        // Parse time filters
        const timeFilters = LogsService.parseTimeFilters(lookbackTime, timeRange);
        if (timeFilters === null) {
            res.status(400).json({
                error: 'Invalid time filter format. Use lookbackTime (e.g., "5d", "2h") or timeRange (e.g., "2024-01-01 to 2024-01-31")',
            });
            return;
        }

        // Build delete options
        const deleteOptions: {
            level?: string;
            environment?: string;
            minTimestampMS?: number;
            maxTimestampMS?: number;
        } = {
            ...timeFilters,
        };

        if (level) {
            deleteOptions.level = level;
        }

        if (env) {
            deleteOptions.environment = env;
        }

        // Delete logs
        const result = await LogsService.deleteLogsByProjectId(projectId, deleteOptions);

        res.json({
            message: 'Logs purged successfully',
            deletedCount: result.deletedCount,
        });
    } catch (error: any) {
        console.error('Error purging logs:', error);
        res.status(500).json({
            error: 'Failed to purge logs',
            details: error.message,
        });
    }
};

