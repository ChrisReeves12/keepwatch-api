import { ObjectId } from 'mongodb';

/**
 * User interface representing a user document in MongoDB
 * Note: _id is handled separately by MongoDB as ObjectId
 */
export interface User {
    _id?: ObjectId | string;
    name: string;
    email: string;
    password: string;
    userId: string; // Unique machine-readable identifier
    company?: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * User creation input
 */
export interface CreateUserInput {
    name: string;
    email: string;
    password: string;
    company?: string;
}

/**
 * User update input (all fields optional except userId)
 */
export interface UpdateUserInput {
    name?: string;
    email?: string;
    password?: string;
    company?: string;
}

