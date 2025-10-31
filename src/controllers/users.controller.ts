import { Request, Response } from 'express';
import * as UsersService from '../services/users.service';
import { CreateUserInput, UpdateUserInput } from '../types/user.types';

/**
 * @swagger
 * /api/v1/users:
 *   post:
 *     summary: Create a new user
 *     description: Register a new user account
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserInput'
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User created successfully
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: User with this email already exists
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
export const createUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const userData: CreateUserInput = req.body;

        // Validate required fields
        if (!userData.name || !userData.email || !userData.password) {
            res.status(400).json({
                error: 'Missing required fields: name, email, password',
            });
            return;
        }

        // Check if email already exists
        if (await UsersService.emailExists(userData.email)) {
            res.status(409).json({
                error: 'User with this email already exists',
            });
            return;
        }

        const user = await UsersService.createUser(userData);

        // Remove password from response
        const { password, ...userResponse } = user;

        res.status(201).json({
            message: 'User created successfully',
            user: userResponse,
        });
    } catch (error: any) {
        console.error('Error creating user:', error);
        res.status(500).json({
            error: 'Failed to create user',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/users/me:
 *   get:
 *     summary: Get current user
 *     description: Get the currently authenticated user's information
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
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
export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const userId = req.user.userId;
        const user = await UsersService.findUserByUserId(userId);

        if (!user) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        // Remove password from response
        const { password, ...userResponse } = user;

        res.json({
            user: userResponse,
        });
    } catch (error: any) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            error: 'Failed to fetch user',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/users/me:
 *   put:
 *     summary: Update current user
 *     description: Update the currently authenticated user's information
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserInput'
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User updated successfully
 *                 user:
 *                   $ref: '#/components/schemas/User'
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
 *       409:
 *         description: User with this email already exists
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
export const updateCurrentUser = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const userId = req.user.userId;
        const updateData: UpdateUserInput = req.body;

        // Check if user exists
        const existingUser = await UsersService.findUserByUserId(userId);
        if (!existingUser) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        // If email is being updated, check if new email already exists
        if (updateData.email && updateData.email !== existingUser.email) {
            if (await UsersService.emailExists(updateData.email)) {
                res.status(409).json({
                    error: 'User with this email already exists',
                });
                return;
            }
        }

        const updatedUser = await UsersService.updateUser(userId, updateData);

        if (!updatedUser) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        // Remove password from response
        const { password, ...userResponse } = updatedUser;

        res.json({
            message: 'User updated successfully',
            user: userResponse,
        });
    } catch (error: any) {
        console.error('Error updating user:', error);
        res.status(500).json({
            error: 'Failed to update user',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/users/me:
 *   delete:
 *     summary: Delete current user
 *     description: Delete the currently authenticated user's account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User deleted successfully
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
export const deleteCurrentUser = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const userId = req.user.userId;
        const deleted = await UsersService.deleteUser(userId);

        if (!deleted) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        res.json({
            message: 'User deleted successfully',
        });
    } catch (error: any) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            error: 'Failed to delete user',
            details: error.message,
        });
    }
};

