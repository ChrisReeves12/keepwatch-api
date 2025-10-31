/**
 * Project user with role
 */
export interface ProjectUser {
    id: string; // Firestore document ID
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
 * Project interface representing a project document in Firestore
 */
export interface Project {
    _id?: string; // Firestore document ID
    name: string;
    description?: string;
    projectId: string; // User-friendly slug identifier
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
