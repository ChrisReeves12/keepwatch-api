import { Request, Response } from 'express';
import * as UsersService from '../services/users.service';
import { CreateUserInput, UpdateUserInput } from '../types/user.types';

/**
 * Create a new user
 * POST /api/v1/users
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
 * Get the current authenticated user
 * GET /api/v1/users/me
 * Protected: Requires authentication
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
 * Update the current authenticated user
 * PUT /api/v1/users/me
 * Protected: Requires authentication
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
 * Delete the current authenticated user
 * DELETE /api/v1/users/me
 * Protected: Requires authentication
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

