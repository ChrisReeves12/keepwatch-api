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
 * Get a user by userId
 * GET /api/v1/users/:userId
 */
export const getUserByUserId = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId } = req.params;

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
 * Get all users
 * GET /api/v1/users
 */
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const skip = parseInt(req.query.skip as string) || 0;

        const users = await UsersService.getAllUsers(limit, skip);

        // Remove passwords from response
        const usersResponse = users.map(({ password, ...user }) => user);

        res.json({
            users: usersResponse,
            count: usersResponse.length,
        });
    } catch (error: any) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            error: 'Failed to fetch users',
            details: error.message,
        });
    }
};

/**
 * Update a user by userId
 * PUT /api/v1/users/:userId
 */
export const updateUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId } = req.params;
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
 * Delete a user by userId
 * DELETE /api/v1/users/:userId
 */
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId } = req.params;

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

