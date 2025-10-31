import { randomUUID } from 'crypto';
import { getFirestore } from '../database/firestore.connection';
import { Log, CreateLogInput } from '../types/log.types';
import { getTypesenseClient, isTypesenseEnabled } from './typesense.service';
import { findProjectByProjectId } from './projects.service';

const COLLECTION_NAME = 'logs';

/**
 * Get the logs collection
 */
function getLogsCollection() {
    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not connected');
    }
    return db.collection(COLLECTION_NAME);
}

/**
 * Convert Firestore document to Log type
 */
function toLog(doc: FirebaseFirestore.DocumentSnapshot): Log | null {
    if (!doc.exists) return null;
    
    const data = doc.data()!;
    return {
        ...data,
        _id: doc.id,
        createdAt: data.createdAt?.toDate() || new Date(),
    } as Log;
}

/**
 * Create indexes for the logs collection
 * Firestore creates indexes automatically for single fields
 */
export async function createLogIndexes(): Promise<void> {
    // Firestore auto-creates single-field indexes
    // Composite indexes for common queries would be defined in firestore.indexes.json
    console.log('✅ Firestore auto-creates indexes for logs collection');
}

/**
 * Create a new log
 * @param logData - Log data to create
 * @returns Created log document
 */
export async function createLog(logData: CreateLogInput): Promise<Log> {
    const collection = getLogsCollection();

    // Look up project by projectId (string slug) to get its document ID
    const project = await findProjectByProjectId(logData.projectId);
    if (!project || !project._id) {
        throw new Error('Project not found');
    }

    const projectDocId = typeof project._id === 'string' ? project._id : project._id;

    const now = new Date();
    const log: Omit<Log, '_id'> = {
        level: logData.level,
        environment: logData.environment,
        projectId: logData.projectId,
        projectObjectId: projectDocId, // Store the Firestore document ID
        message: logData.message,
        stackTrace: logData.stackTrace || [],
        details: logData.details || {},
        timestampMS: logData.timestampMS,
        createdAt: now,
    };

    const docRef = await collection.add(log);
    const doc = await docRef.get();

    return toLog(doc)!;
}

/**
 * Convert Typesense document to Log format
 * @param doc - Typesense document
 * @param projectId - Project ID (string slug) to use for lookup
 * @returns Log object
 */
async function typesenseDocToLog(doc: any, projectId: string): Promise<Log> {
    // Look up project to get its document ID
    const project = await findProjectByProjectId(doc.projectId || projectId);
    if (!project || !project._id) {
        throw new Error(`Project not found: ${doc.projectId || projectId}`);
    }

    const projectDocId = typeof project._id === 'string' ? project._id : project._id;

    return {
        level: doc.level,
        environment: doc.environment,
        projectId: doc.projectId || projectId,
        projectObjectId: projectDocId,
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
    if (!isTypesenseEnabled()) {
        return getLogsByProjectIdFromFirestore(projectId, page, pageSize, level, environment, message);
    }

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
    const logs = await Promise.all(
        (searchResults.hits || []).map((hit: any) =>
            typesenseDocToLog(hit.document, projectId)
        )
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
 * Get a log by Firestore document _id
 * @param id - Firestore document ID string
 * @returns Log document or null
 */
export async function findLogById(id: string): Promise<Log | null> {
    const collection = getLogsCollection();
    const doc = await collection.doc(id).get();
    return toLog(doc);
}

/**
 * Index a log document in Typesense
 * @param logData - Log data to index (can be CreateLogInput or Log)
 */
export async function indexLogInSearch(logData: CreateLogInput | Log): Promise<void> {
    if (!isTypesenseEnabled()) {
        return;
    }

    try {
        const typesenseClient = getTypesenseClient();

        // Convert log to Typesense document format
        // Generate a UUID for the Typesense document ID (we don't use Firestore _id)
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

/**
 * Get logs from Firestore (fallback when Typesense is not enabled)
 */
async function getLogsByProjectIdFromFirestore(
    projectId: string,
    page: number,
    pageSize: number,
    level?: string,
    environment?: string,
    message?: string
): Promise<{ logs: Log[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const collection = getLogsCollection();

    // Build query
    let query: FirebaseFirestore.Query = collection.where('projectId', '==', projectId);

    if (level) {
        query = query.where('level', '==', level);
    }

    if (environment) {
        query = query.where('environment', '==', environment);
    }

    // Note: Firestore doesn't support regex/text search like MongoDB
    // Message search would need to be handled by Typesense or client-side filtering
    if (message) {
        console.warn('Message search is not supported in Firestore. Use Typesense for full-text search.');
    }

    // Get total count (this requires a separate query)
    const countSnapshot = await query.get();
    const total = countSnapshot.size;
    const totalPages = Math.ceil(total / pageSize);

    // Get paginated results
    query = query.orderBy('timestampMS', 'desc');
    
    if (page > 1) {
        query = query.offset((page - 1) * pageSize);
    }
    
    query = query.limit(pageSize);

    const snapshot = await query.get();
    const logs = snapshot.docs.map(doc => toLog(doc)).filter((log): log is Log => Boolean(log));

    return {
        logs,
        total,
        page,
        pageSize,
        totalPages,
    };
}
