import { ObjectId } from 'mongodb';

/**
 * Project user with role
 */
export interface ProjectUser {
    id: ObjectId;
    role: 'viewer' | 'editor' | 'admin';
}

/**
 * API key for a project
 */
export interface ProjectApiKey {
    id: string;
    key: string;
    createdAt: Date;
    constraints: Record<string, any>; // Configuration that limits API key usage
}

/**
 * Project interface representing a project document in MongoDB
 */
export interface Project {
    _id?: ObjectId | string;
    name: string;
    description?: string;
    projectId: string;
    users: ProjectUser[];
    apiKeys?: ProjectApiKey[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Project creation input
 */
export interface CreateProjectInput {
    name: string;
    description?: string;
}

/**
 * Project update input
 */
export interface UpdateProjectInput {
    name?: string;
    description?: string;
    users?: ProjectUser[];
}

