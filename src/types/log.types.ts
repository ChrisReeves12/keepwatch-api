/**
 * Log interface representing a log document in Firestore
 */
export interface Log {
    _id?: string; // Firestore document ID
    level: string;
    environment: string;
    projectId: string; // Project slug identifier
    projectObjectId: string; // Firestore document ID of the project
    message: string;
    stackTrace: Array<Record<string, any>>;
    details: Record<string, any>;
    timestampMS: number; // UNIX timestamp in milliseconds
    createdAt: Date;
}

/**
 * Log creation input
 */
export interface CreateLogInput {
    level: string;
    environment: string;
    projectId: string;
    message: string;
    stackTrace?: Array<Record<string, any>>;
    details?: Record<string, any>;
    timestampMS: number;
}

/**
 * Log query parameters for filtering and pagination
 */
export interface LogQueryParams {
    page?: number;
    pageSize?: number;
    level?: string;
    environment?: string;
}
