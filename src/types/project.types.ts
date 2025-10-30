import { ObjectId } from 'mongodb';

/**
 * Project user with role
 */
export interface ProjectUser {
    id: ObjectId;
    role: 'viewer' | 'editor' | 'admin';
}

/**
 * Project interface representing a project document in MongoDB
 */
export interface Project {
    _id?: ObjectId | string;
    name: string;
    description?: string;
    projectId: string; // Unique machine-readable identifier
    users: ProjectUser[];
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

