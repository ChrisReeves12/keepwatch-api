import { ObjectId } from 'mongodb';

/**
 * Log interface representing a log document in MongoDB
 */
export interface Log {
    _id?: ObjectId | string;
    level: string;
    environment: string;
    projectId: string;
    projectObjectId: ObjectId;
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

