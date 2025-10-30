import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../services/jwt.service';

declare global {
    namespace Express {
        interface Request {
            user?: JWTPayload;
        }
    }
}

/**
 * Authentication middleware to verify JWT token
 * Adds user payload to request if token is valid
 * Skips JWT validation if API key authentication was already successful
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
    try {
        // If already authenticated via API key, skip JWT validation
        if ((req as any).apiKeyProject) {
            next();
            return;
        }

        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                error: 'No token provided. Authorization header must be in format: Bearer <token>',
            });
            return;
        }

        // Extract token from "Bearer <token>"
        const token = authHeader.split(' ')[1];
        const userClaims = verifyToken(token);

        if (!userClaims) {
            res.status(401).json({
                error: 'Invalid or expired token',
            });
            return;
        }

        req.user = userClaims;
        next();
    } catch (error: any) {
        console.error('Authentication error:', error);
        res.status(401).json({
            error: 'Authentication failed',
            details: error.message,
        });
    }
};

/**
 * Middleware to ensure the authenticated user can only access their own resources
 * Checks that the userId in the route params matches the authenticated user's userId
 */
export const ensureOwnResource = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
        res.status(401).json({
            error: 'Authentication required',
        });
        return;
    }

    const { userId } = req.params;

    if (req.user.userId !== userId) {
        res.status(403).json({
            error: 'Forbidden: You can only access your own resources',
        });
        return;
    }

    next();
};

