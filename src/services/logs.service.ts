import { randomUUID } from 'crypto';
import * as moment from 'moment';
import { getFirestore } from '../database/firestore.connection';
import { Log, CreateLogInput, MessageFilter } from '../types/log.types';
import { getTypesenseClient, isTypesenseEnabled } from './typesense.service';
import { findProjectByProjectId } from './projects.service';

const COLLECTION_NAME = 'logs';

/**
 * Process a log message by saving it to Firestore and indexing in Typesense.
 * This is the shared processing logic used by both the local worker and Cloud Function.
 *
 * @param logData - The log data to process
 * @throws Error if processing fails
 */
export async function storeLogMessage(logData: CreateLogInput): Promise<void> {
    console.log(`📝 Processing log for project: ${logData.projectId}, level: ${logData.level}`);

    // Process the log (save to Firestore and index in Typesense)
    await Promise.all([
        createLog(logData),
        indexLogInSearch(logData),
    ]);

    console.log('✅ Log processed successfully');
}

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
        rawStackTrace: logData.rawStackTrace,
        detailString: logData.detailString || null,
        details: logData.details || {},
        timestampMS: logData.timestampMS ?? Date.now(),
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
        rawStackTrace: doc.rawStackTrace,
        details: doc.details || {},
        detailString: doc.detailString,
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
 * @param messageFilter - Optional message filter with AND/OR logic
 * @returns Object containing logs array, total count, page, and pageSize
 */
export async function getLogsByProjectId(
    projectId: string,
    page: number = 1,
    pageSize: number = 50,
    level?: string,
    environment?: string,
    messageFilter?: MessageFilter,
    stackTraceFilter?: MessageFilter,
    detailsFilter?: MessageFilter
): Promise<{ logs: Log[]; total: number; page: number; pageSize: number; totalPages: number }> {
    if (!isTypesenseEnabled()) {
        return getLogsByProjectIdFromFirestore(
            projectId,
            page,
            pageSize,
            level,
            environment,
            messageFilter,
            stackTraceFilter,
            detailsFilter
        );
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
    let searchQuery = '*';
    let queryBy: string | undefined;
    let useBooleanAnd: boolean | undefined;

    if (messageFilter && messageFilter.conditions.length > 0) {
        // Build Typesense query for message filter
        const queryParts: string[] = [];

        for (const condition of messageFilter.conditions) {
            const { phrase, matchType } = condition;
            let queryPart: string;

            switch (matchType) {
                case 'startsWith':
                    queryPart = `${phrase}*`;
                    break;
                case 'endsWith':
                    queryPart = `*${phrase}`;
                    break;
                case 'contains':
                default:
                    queryPart = phrase;
                    break;
            }

            queryParts.push(queryPart);
        }

        // Join terms with spaces; enforce AND via use_boolean_and flag
        searchQuery = queryParts.join(' ');
        useBooleanAnd = messageFilter.operator === 'AND';
        queryBy = 'message';
    }

    const searchParameters: any = {
        q: searchQuery,
        filter_by: filterBy.join(' && '),
        sort_by: 'timestampMS:desc',
        per_page: pageSize,
        page: page,
    };

    if (queryBy) {
        searchParameters.query_by = queryBy;
    }

    if (useBooleanAnd !== undefined) {
        searchParameters.use_boolean_and = useBooleanAnd;
    }

    // Execute search
    const searchResults = await typesenseClient
        .collections('logs')
        .documents()
        .search(searchParameters);

    // Enforce message/stackTrace/details filter semantics on returned hits to guarantee correctness
    let hits: any[] = searchResults.hits || [];
    if (messageFilter && messageFilter.conditions.length > 0) {
        hits = hits.filter((hit: any) =>
            typeof hit?.document?.message === 'string' &&
            messageMatchesFilter(hit.document.message, messageFilter)
        );
    }

    if (stackTraceFilter && stackTraceFilter.conditions.length > 0) {
        hits = hits.filter((hit: any) =>
            messageMatchesFilter(getStackTraceText(hit?.document), stackTraceFilter)
        );
    }

    if (detailsFilter && detailsFilter.conditions.length > 0) {
        hits = hits.filter((hit: any) =>
            messageMatchesFilter(getDetailsText(hit?.document), detailsFilter)
        );
    }

    const total = hits.length;
    const totalPages = Math.ceil(total / pageSize);

    // Convert Typesense documents to Log format
    const logs = await Promise.all(
        hits.map((hit: any) => typesenseDocToLog(hit.document, projectId))
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
            rawStackTrace: logData.rawStackTrace,
            details: logData.details || {},
            timestampMS: logData.timestampMS ?? Date.now(), // Use provided timestamp or generate one
            createdAt: 'createdAt' in logData
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
 * Test if a message matches a message filter condition
 * @param message - The message to test
 * @param condition - The condition to match
 * @returns True if the message matches the condition
 */
function messageMatchesCondition(message: string, condition: { phrase: string; matchType: string }): boolean {
    const lowerMessage = message.toLowerCase();
    const lowerPhrase = condition.phrase.toLowerCase();

    switch (condition.matchType) {
        case 'startsWith':
            return lowerMessage.startsWith(lowerPhrase);
        case 'endsWith':
            return lowerMessage.endsWith(lowerPhrase);
        case 'contains':
        default:
            return lowerMessage.includes(lowerPhrase);
    }
}

/**
 * Test if a message matches a message filter
 * @param message - The message to test
 * @param messageFilter - The filter to apply
 * @returns True if the message matches the filter
 */
function messageMatchesFilter(message: string, messageFilter: MessageFilter): boolean {
    if (!messageFilter.conditions || messageFilter.conditions.length === 0) {
        return true;
    }

    if (messageFilter.operator === 'AND') {
        return messageFilter.conditions.every(condition =>
            messageMatchesCondition(message, condition)
        );
    } else {
        // OR
        return messageFilter.conditions.some(condition =>
            messageMatchesCondition(message, condition)
        );
    }
}

/**
 * Extract a string representation of stack trace data from a Typesense doc or Log
 */
function getStackTraceText(source: any): string {
    const raw = typeof source?.rawStackTrace === 'string' ? source.rawStackTrace : '';
    if (raw) return raw;
    const stack = Array.isArray(source?.stackTrace) ? source.stackTrace : [];
    try {
        return stack
            .map((f: any) =>
                [f?.message, f?.originalLine, f?.file, f?.function]
                    .filter(Boolean)
                    .join(' ')
            )
            .join(' | ');
    } catch {
        return '';
    }
}

/**
 * Extract a string representation of details data from a Typesense doc or Log
 */
function getDetailsText(source: any): string {
    if (typeof source?.detailString === 'string' && source.detailString) {
        return source.detailString as string;
    }
    if (source?.details && typeof source.details === 'object') {
        try {
            return JSON.stringify(source.details);
        } catch {
            return '';
        }
    }
    return '';
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
    messageFilter?: MessageFilter,
    stackTraceFilter?: MessageFilter,
    detailsFilter?: MessageFilter
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

    // Note: Firestore doesn't support regex/text search natively
    // We'll fetch all matching documents and filter in memory
    if (messageFilter) {
        console.warn('Message filtering in Firestore requires client-side filtering. Consider using Typesense for better performance.');
    }

    // Get all matching documents (before message filtering)
    query = query.orderBy('timestampMS', 'desc');
    const snapshot = await query.get();
    let allLogs = snapshot.docs.map(doc => toLog(doc)).filter((log): log is Log => Boolean(log));

    // Apply message filter if provided
    if (messageFilter && messageFilter.conditions.length > 0) {
        allLogs = allLogs.filter(log => messageMatchesFilter(log.message, messageFilter));
    }

    // Apply stackTrace filter
    if (stackTraceFilter && stackTraceFilter.conditions.length > 0) {
        allLogs = allLogs.filter(log =>
            messageMatchesFilter(
                log.rawStackTrace || getStackTraceText(log as any),
                stackTraceFilter
            )
        );
    }

    // Apply details filter
    if (detailsFilter && detailsFilter.conditions.length > 0) {
        allLogs = allLogs.filter(log =>
            messageMatchesFilter(
                typeof (log as any).detailString === 'string' && (log as any).detailString
                    ? (log as any).detailString
                    : getDetailsText(log as any),
                detailsFilter
            )
        );
    }

    const total = allLogs.length;
    const totalPages = Math.ceil(total / pageSize);

    // Apply pagination
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const logs = allLogs.slice(startIndex, endIndex);

    return {
        logs,
        total,
        page,
        pageSize,
        totalPages,
    };
}

/**
 * Parse lookback time string (e.g., "5d", "2h", "10m", "3months") and return milliseconds
 * @param lookbackTime - String like "5d", "2h", "10m", "3months"
 * @returns Milliseconds since epoch for the lookback time, or null if invalid
 */
function parseLookbackTime(lookbackTime: string): number | null {
    try {
        // Parse formats like "5d", "2h", "10m", "3months"
        const match = lookbackTime.match(/^(\d+)([a-z]+)$/i);
        if (!match) {
            return null;
        }

        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        // Map units to moment.js units
        const unitMap: Record<string, moment.unitOfTime.DurationConstructor> = {
            's': 'seconds',
            'sec': 'seconds',
            'second': 'seconds',
            'seconds': 'seconds',
            'm': 'minutes',
            'min': 'minutes',
            'minute': 'minutes',
            'minutes': 'minutes',
            'h': 'hours',
            'hr': 'hours',
            'hour': 'hours',
            'hours': 'hours',
            'd': 'days',
            'day': 'days',
            'days': 'days',
            'w': 'weeks',
            'week': 'weeks',
            'weeks': 'weeks',
            'month': 'months',
            'months': 'months',
            'y': 'years',
            'yr': 'years',
            'year': 'years',
            'years': 'years',
        };

        const momentUnit = unitMap[unit];
        if (!momentUnit) {
            return null;
        }

        const now = moment.utc();
        const lookbackDate = now.subtract(value, momentUnit);
        return lookbackDate.valueOf();
    } catch (error) {
        return null;
    }
}

/**
 * Parse time range string (e.g., "2024-01-01 to 2024-01-31" or "2024-01-01-12:00:00 to 2024-01-31-23:59:59")
 * @param timeRange - String like "YYYY-MM-DD to YYYY-MM-DD" or "YYYY-MM-DD-HH:MM:SS to YYYY-MM-DD-HH:MM:SS"
 * @returns Object with start and end timestamps in milliseconds, or null if invalid
 */
function parseTimeRange(timeRange: string): { startMS: number; endMS: number } | null {
    try {
        const parts = timeRange.split(' to ').map(s => s.trim());
        if (parts.length !== 2) {
            return null;
        }

        const [startStr, endStr] = parts;

        // Try parsing with time format first (YYYY-MM-DD-HH:MM:SS)
        let startMoment = moment.utc(startStr, 'YYYY-MM-DD-HH:mm:ss', true);
        let endMoment = moment.utc(endStr, 'YYYY-MM-DD-HH:mm:ss', true);

        // If that fails, try date-only format (YYYY-MM-DD)
        if (!startMoment.isValid()) {
            startMoment = moment.utc(startStr, 'YYYY-MM-DD', true);
        }
        if (!endMoment.isValid()) {
            endMoment = moment.utc(endStr, 'YYYY-MM-DD', true);
        }

        // If date-only, set start to beginning of day and end to end of day
        if (startStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            startMoment = startMoment.startOf('day');
        }
        if (endStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            endMoment = endMoment.endOf('day');
        }

        if (!startMoment.isValid() || !endMoment.isValid()) {
            return null;
        }

        return {
            startMS: startMoment.valueOf(),
            endMS: endMoment.valueOf(),
        };
    } catch (error) {
        return null;
    }
}

/**
 * Delete logs for a project with optional filters
 * @param projectId - The projectId to delete logs for
 * @param options - Filter options
 * @returns Number of logs deleted
 */
export async function deleteLogsByProjectId(
    projectId: string,
    options?: {
        level?: string;
        environment?: string;
        minTimestampMS?: number;
        maxTimestampMS?: number;
    }
): Promise<{ deletedCount: number }> {
    const collection = getLogsCollection();

    // Build Firestore query
    let query: FirebaseFirestore.Query = collection.where('projectId', '==', projectId);

    if (options?.level) {
        query = query.where('level', '==', options.level);
    }

    if (options?.environment) {
        query = query.where('environment', '==', options.environment);
    }

    if (options?.minTimestampMS !== undefined) {
        query = query.where('timestampMS', '>=', options.minTimestampMS);
    }

    if (options?.maxTimestampMS !== undefined) {
        query = query.where('timestampMS', '<=', options.maxTimestampMS);
    }

    // Get all matching documents
    const snapshot = await query.get();
    const docsToDelete = snapshot.docs;
    let deletedCount = 0;

    // Delete from Firestore in batches (Firestore batch limit is 500)
    const batchSize = 500;
    for (let i = 0; i < docsToDelete.length; i += batchSize) {
        const batch = collection.firestore.batch();
        const batchDocs = docsToDelete.slice(i, i + batchSize);

        for (const doc of batchDocs) {
            batch.delete(doc.ref);
        }

        await batch.commit();
        deletedCount += batchDocs.length;
    }

    // Delete from Typesense if enabled
    if (isTypesenseEnabled()) {
        try {
            const typesenseClient = getTypesenseClient();

            // Build filter_by clause for Typesense
            const filterBy: string[] = [`projectId:${projectId}`];

            if (options?.level) {
                filterBy.push(`level:${options.level}`);
            }

            if (options?.environment) {
                filterBy.push(`environment:${options.environment}`);
            }

            if (options?.minTimestampMS !== undefined) {
                filterBy.push(`timestampMS:>=${options.minTimestampMS}`);
            }

            if (options?.maxTimestampMS !== undefined) {
                filterBy.push(`timestampMS:<=${options.maxTimestampMS}`);
            }

            // Typesense doesn't support bulk delete by filter, so we need to search and delete
            // Process in pages to avoid memory issues
            let page = 1;
            const perPage = 250; // Typesense max per page
            let hasMore = true;
            let typesenseDeletedCount = 0;

            while (hasMore) {
                const searchResults = await typesenseClient
                    .collections('logs')
                    .documents()
                    .search({
                        q: '*',
                        filter_by: filterBy.join(' && '),
                        per_page: perPage,
                        page: page,
                    });

                const hits = searchResults.hits || [];
                if (hits.length === 0) {
                    hasMore = false;
                    break;
                }

                // Delete each document
                for (const hit of hits) {
                    try {
                        const documentId = (hit.document as any).id;
                        if (documentId) {
                            await typesenseClient
                                .collections('logs')
                                .documents(documentId)
                                .delete();
                            typesenseDeletedCount++;
                        }
                    } catch (error: any) {
                        // Ignore 404 errors (document already deleted)
                        if (error?.httpStatus !== 404) {
                            console.error('Error deleting Typesense document:', error);
                        }
                    }
                }

                // Check if there are more pages
                const totalFound = searchResults.found || 0;
                hasMore = page * perPage < totalFound;
                page++;
            }

            console.log(`Deleted ${typesenseDeletedCount} documents from Typesense`);
        } catch (error) {
            console.error('Error deleting logs from Typesense:', error);
            // Don't throw - Firestore deletion succeeded, Typesense is secondary
        }
    }

    return { deletedCount };
}

/**
 * Helper function to parse lookback time and time range from query parameters
 * @param lookbackTime - Optional lookback time string
 * @param timeRange - Optional time range string
 * @returns Object with minTimestampMS and maxTimestampMS, or null if invalid
 */
export function parseTimeFilters(
    lookbackTime?: string,
    timeRange?: string
): { minTimestampMS?: number; maxTimestampMS?: number } | null {
    if (lookbackTime && timeRange) {
        // Both cannot be specified
        return null;
    }

    if (lookbackTime) {
        const thresholdMS = parseLookbackTime(lookbackTime);
        if (thresholdMS === null) {
            return null;
        }
        // Delete logs older than the threshold (keep only logs within the lookback window)
        return { maxTimestampMS: thresholdMS };
    }

    if (timeRange) {
        const range = parseTimeRange(timeRange);
        if (range === null) {
            return null;
        }
        return {
            minTimestampMS: range.startMS,
            maxTimestampMS: range.endMS,
        };
    }

    // No time filters
    return {};
}
