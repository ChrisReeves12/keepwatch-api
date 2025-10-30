import { Request, Response } from 'express';
import * as UsersService from '../services/users.service';
import { verifyPassword } from '../services/crypt.service';
import { createToken } from '../services/jwt.service';

/**
 * Authenticate a user with email and password
 * POST /api/v1/auth/authenticate
 */
export const authenticate = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        // Validate required fields
        if (!email || !password) {
            res.status(400).json({
                error: 'Missing required fields: email, password',
            });
            return;
        }

        // Find user by email
        const user = await UsersService.findUserByEmail(email);

        if (!user) {
            res.status(401).json({
                error: 'Invalid email or password',
            });
            return;
        }

        // Verify password
        const isPasswordValid = await verifyPassword(password, user.password);

        if (!isPasswordValid) {
            res.status(401).json({
                error: 'Invalid email or password',
            });
            return;
        }

        // Create JWT token
        const token = createToken({
            userId: user.userId,
            email: user.email,
        });

        // Remove password from response
        const { password: _, ...userResponse } = user;

        res.json({
            message: 'Authentication successful',
            token,
            user: userResponse,
        });
    } catch (error: any) {
        console.error('Error authenticating user:', error);
        res.status(500).json({
            error: 'Failed to authenticate user',
            details: error.message,
        });
    }
};

