import { Request, Response, NextFunction } from 'express';
import { findProjectByApiKey } from '../services/projects.service';
import { Project } from '../types/project.types';

declare global {
    namespace Express {
        interface Request {
            apiKeyProject?: Project; // Project associated with API key authentication
        }
    }
}

/**
 * Middleware to authenticate requests using API keys
 * Checks for API key in X-API-Key header
 * If API key is found and valid, attaches the project to req.apiKeyProject
 * If no API key is found, returns 401 error
 */
export const authenticateApiKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Check for API key in X-API-Key header
        const apiKey = req.headers['x-api-key'] as string | undefined;

        if (!apiKey) {
            res.status(401).json({
                error: 'API key authentication required',
            });
            return;
        }

        // Find project by API key
        const project = await findProjectByApiKey(apiKey);

        if (!project) {
            res.status(401).json({
                error: 'Invalid API key',
            });
            return;
        }

        // Attach project to request
        req.apiKeyProject = project;
        next();
    } catch (error: any) {
        console.error('API key authentication error:', error);
        res.status(401).json({
            error: 'API key authentication failed',
            details: error.message,
        });
    }
};

