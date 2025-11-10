import { Request, Response, NextFunction } from 'express';

import { verifyToken } from '../services/jwt.service';
import { findSystemAdminById } from '../services/system-admins.service';
import { SystemAdmin, SystemAdminRole } from '../types/subscription.types';

declare global {
    namespace Express {
        interface Request {
            systemAdmin?: SystemAdmin;
        }
    }
}

export async function authenticateSystemAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                error: 'System admin token required. Use Authorization: Bearer <token>',
            });
            return;
        }

        const token = authHeader.split(' ')[1];
        const claims = verifyToken(token);

        if (!claims) {
            res.status(401).json({
                error: 'Invalid or expired system admin token',
            });
            return;
        }

        const systemAdmin = await findSystemAdminById(claims.userId);

        if (!systemAdmin) {
            res.status(401).json({
                error: 'System admin not found',
            });
            return;
        }

        req.systemAdmin = systemAdmin;
        next();
    } catch (error: any) {
        console.error('System admin authentication error:', error);
        res.status(401).json({
            error: 'System admin authentication failed',
            details: error.message,
        });
    }
}

export function requireSystemAdminRole(...allowedRoles: SystemAdminRole[]) {
    const resolvedRoles = allowedRoles.length ? allowedRoles : ['superadmin', 'superuser'];

    return (req: Request, res: Response, next: NextFunction): void => {
        const systemAdmin = req.systemAdmin;

        if (!systemAdmin) {
            res.status(401).json({
                error: 'System admin authentication required',
            });
            return;
        }

        const role = systemAdmin.role;

        if (!resolvedRoles.includes(role)) {
            res.status(403).json({
                error: 'Insufficient permissions for system admin operation',
            });
            return;
        }

        next();
    };
}

