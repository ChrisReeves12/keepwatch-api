import { ObjectId, WithId } from 'mongodb';
import { randomUUID } from 'crypto';
import { getDatabase } from '../database/connection';
import { Log, CreateLogInput } from '../types/log.types';
import { getTypesenseClient } from './typesense.service';

const COLLECTION_NAME = 'logs';

/**
 * Get the logs collection
 */
function getLogsCollection() {
    const db = getDatabase();
    if (!db) {
        throw new Error('Database not connected');
    }
    return db.collection<Log>(COLLECTION_NAME);
}

/**
 * Convert MongoDB document to Log type
 */
function toLog(doc: WithId<Log> | null): Log | null {
    if (!doc) return null;
    const log = { ...doc } as Log;
    log._id = doc._id.toString();
    return log;
}

/**
 * Create indexes for the logs collection
 * Should be called once on application startup
 */
export async function createLogIndexes(): Promise<void> {
    try {
        const collection = getLogsCollection();

        // Create index on projectId for faster lookups
        await collection.createIndex({ projectId: 1 });

        // Create index on projectObjectId for faster lookups
        await collection.createIndex({ projectObjectId: 1 });

        // Create compound index for common queries (projectId, timestampMS descending)
        await collection.createIndex({ projectId: 1, timestampMS: -1 });

        // Create index on level for filtering
        await collection.createIndex({ level: 1 });

        // Create index on environment for filtering
        await collection.createIndex({ environment: 1 });

        console.log('✅ Log indexes created');
    } catch (error) {
        console.error('❌ Failed to create log indexes:', error);
        throw error;
    }
}

/**
 * Create a new log
 * @param logData - Log data to create
 * @returns Created log document
 */
export async function createLog(logData: CreateLogInput): Promise<Log> {
    const collection = getLogsCollection();

    // Convert projectId to ObjectId
    if (!ObjectId.isValid(logData.projectId)) {
        throw new Error('Invalid projectId');
    }

    const projectObjectId = new ObjectId(logData.projectId);

    const now = new Date();
    const log: Log = {
        level: logData.level,
        environment: logData.environment,
        projectId: logData.projectId,
        projectObjectId,
        message: logData.message,
        stackTrace: logData.stackTrace || [],
        details: logData.details || {},
        timestampMS: logData.timestampMS,
        createdAt: now,
    };

    const result = await collection.insertOne(log);

    if (!result.insertedId) {
        throw new Error('Failed to create log');
    }

    const createdLog = await collection.findOne({ _id: result.insertedId });
    if (!createdLog) {
        throw new Error('Failed to retrieve created log');
    }

    return toLog(createdLog)!;
}

/**
 * Convert Typesense document to Log format
 */
function typesenseDocToLog(doc: any, projectId: string): Log {
    return {
        level: doc.level,
        environment: doc.environment,
        projectId: doc.projectId || projectId,
        projectObjectId: new ObjectId(doc.projectId || projectId),
        message: doc.message,
        stackTrace: doc.stackTrace || [],
        details: doc.details || {},
        timestampMS: doc.timestampMS,
        createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(doc.timestampMS),
    };
}

/**
 * Get logs for a project with filtering and pagination using Typesense
 * @param projectId - The projectId to get logs for
 * @param page - Page number (1-based)
 * @param pageSize - Number of logs per page
 * @param level - Optional filter by log level
 * @param environment - Optional filter by environment
 * @param message - Optional search query for message field
 * @returns Object containing logs array, total count, page, and pageSize
 */
export async function getLogsByProjectId(
    projectId: string,
    page: number = 1,
    pageSize: number = 50,
    level?: string,
    environment?: string,
    message?: string
): Promise<{ logs: Log[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const typesenseClient = getTypesenseClient();

    // Build filter_by clause
    const filterBy: string[] = [`projectId:${projectId}`];

    if (level) {
        filterBy.push(`level:${level}`);
    }

    if (environment) {
        filterBy.push(`environment:${environment}`);
    }

    // Build search parameters
    const searchParameters: any = {
        q: message || '*',
        filter_by: filterBy.join(' && '),
        sort_by: 'timestampMS:desc',
        per_page: pageSize,
        page: page,
    };

    if (message) {
        searchParameters.query_by = 'message';
    }

    // Execute search
    const searchResults = await typesenseClient
        .collections('logs')
        .documents()
        .search(searchParameters);

    const total = searchResults.found || 0;
    const totalPages = Math.ceil(total / pageSize);

    // Convert Typesense documents to Log format
    const logs = (searchResults.hits || []).map((hit: any) =>
        typesenseDocToLog(hit.document, projectId)
    );

    return {
        logs,
        total,
        page,
        pageSize,
        totalPages,
    };
}

/**
 * Get a log by MongoDB _id
 * @param id - MongoDB ObjectId string
 * @returns Log document or null
 */
export async function findLogById(id: string): Promise<Log | null> {
    const collection = getLogsCollection();

    if (!ObjectId.isValid(id)) {
        return null;
    }

    const log = await collection.findOne({ _id: new ObjectId(id) });
    return toLog(log);
}

/**
 * Index a log document in Typesense
 * @param logData - Log data to index (can be CreateLogInput or Log)
 */
export async function indexLogInSearch(logData: CreateLogInput | Log): Promise<void> {
    try {
        const typesenseClient = getTypesenseClient();

        // Convert log to Typesense document format
        // Generate a UUID for the Typesense document ID (we don't use MongoDB _id)
        const document = {
            id: randomUUID(),
            level: logData.level,
            environment: logData.environment,
            projectId: logData.projectId,
            message: logData.message,
            stackTrace: logData.stackTrace || [],
            details: logData.details || {},
            timestampMS: logData.timestampMS,
            createdAt: 'createdAt' in logData && logData.createdAt instanceof Date
                ? logData.createdAt.getTime()
                : Date.now(),
        };

        await typesenseClient.collections('logs').documents().create(document);
    } catch (error) {
        console.error('Failed to index log in Typesense:', error);
        throw error;
    }
}

