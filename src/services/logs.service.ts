import { randomUUID, createHash } from 'crypto';
import moment from 'moment';
import { getFirestore } from '../database/firestore.connection';
import {Log, CreateLogInput, MessageFilter, DocFilter, LogType, LogLevel} from '../types/log.types';
import { getTypesenseClient, isTypesenseEnabled } from './typesense.service';
import { findProjectByProjectId, findCachedProjectById } from './projects.service';
import { sendEmail } from './mail.service';
import slackNotify from 'slack-notify';
import { ProjectAlarm } from '../types/project.types';
import { getCache, setCache, isCachingEnabled } from './redis.service';
import { LOG_ALARM_DEBOUNCE_SECONDS } from '../constants';

const COLLECTION_NAME = 'logs';

/**
 * Generate a unique debounce key for a log alarm based on project, environment, level, and message
 * @param logType - The log Type
 * @param projectId - The project ID
 * @param environment - The environment name
 * @param level - The log level
 * @param message - The log message
 * @returns A unique key string for Redis storage
 */
function generateAlarmDebounceKey(
    logType: LogType,
    projectId: string,
    environment: string,
    level: LogLevel,
    message: string
): string {
    const messageHash = !message ? '---' : createHash('sha256').update(message).digest('hex').substring(0, 24);
    const normalizedEnv = environment.toLowerCase();
    const normalizedLevel = level.toUpperCase();

    return `alarm:debounce:${projectId}:${logType}:${normalizedEnv}:${normalizedLevel}:${messageHash}`;
}

/**
 * Process a log message by saving it to Firestore and indexing in Typesense.
 * This is the shared processing logic used by both the local worker and Cloud Function.
 *
 * @param logData - The log data to process
 * @returns The created Log with its ID
 * @throws Error if processing fails
 */
export async function storeLogMessage(logData: CreateLogInput): Promise<Log> {
    console.log(`📝 Processing log for project: ${logData.projectId}, level: ${logData.level}`);

    // Save to Firestore first to get the log ID
    const log = await createLog(logData);

    // Then index in Typesense (pass the log with _id)
    await indexLogInSearch(log);

    console.log('✅ Log processed successfully');
    return log;
}

/**
 * Process a log alarm by sending an alarm notification
 * @param logData - The log data to process
 * @param logId - The database ID of the stored log
 */
export async function processLogAlarm(logData: CreateLogInput, logId: string): Promise<void> {
    console.log(`🔔 Processing log alarm for project: ${logData.projectId}, level: ${logData.level}, logId: ${logId}`);


    const project = await findCachedProjectById(logData.projectId);
    if (!project) {
        return;
    }

    // Check if the project has any alarms configured
    const alarms = project.alarms || [];
    if (alarms.length === 0) {
        return;
    }

    for (const alarm of alarms) {
        // Check if the log matches the alarm criteria
        const logTypeMatches = alarm.logType === logData.logType;

        // Handle both single string and array of strings for level
        const levelMatches = Array.isArray(alarm.level)
            ? alarm.level.includes(logData.level.toUpperCase() as any)
            : alarm.level === logData.level.toUpperCase();

        const environmentMatches = alarm.environment.toLowerCase() === logData.environment.toLowerCase();

        // Handle null message (null means "match any message")
        const messageMatches = !alarm.message
            ? true
            : logData.message.toLowerCase().includes(alarm.message.toLowerCase());

        if (logTypeMatches && levelMatches && environmentMatches && messageMatches) {
            await deliverAlarm(alarm, logData, project.name, logId);
        }
    }

    console.log('✅ Log alarm processed successfully');
}

/**
 * Deliver an alarm via all configured delivery methods
 * @param alarm - The alarm configuration
 * @param logData - The log data that triggered the alarm
 * @param projectName - The name of the project
 * @param logId - The database ID of the log
 */
async function deliverAlarm(
    alarm: ProjectAlarm,
    logData: CreateLogInput,
    projectName: string,
    logId: string
): Promise<void> {
    // Check if this alarm was recently sent (debouncing)
    if (isCachingEnabled()) {
        const debounceKey = generateAlarmDebounceKey(
            logData.logType,
            logData.projectId,
            logData.environment,
            logData.level as LogLevel,
            logData.message || ''
        );

        const existingAlert = await getCache<string>(debounceKey);
        if (existingAlert) {
            console.log(`Skipping duplicate alarm (debounced): ${debounceKey}`);
            return;
        }

        await setCache(debounceKey, 'sent', LOG_ALARM_DEBOUNCE_SECONDS);
    }

    const deliveryMethods = alarm.deliveryMethods;

    // Format request object as key-value pairs (only non-empty values)
    const formatRequestForDisplay = (request: any): { key: string; value: string }[] => {
        if (!request) return [];
        const lines: { key: string; value: string }[] = [];
        for (const [key, value] of Object.entries(request)) {
            if (value !== undefined && value !== null && value !== '') {
                lines.push({ key, value: String(value) });
            }
        }
        return lines;
    };

    const requestLines = formatRequestForDisplay(logData.request);

    // Construct frontend URL
    const webUrl = `${process.env.WEB_FRONTEND_URL}/project/${logData.projectId}/logs/${logId}`;

    // Prepare alarm details for delivery
    const alarmDetails = {
        logId,
        projectName,
        projectId: logData.projectId,
        level: logData.level,
        environment: logData.environment,
        logType: logData.logType,
        message: logData.message,
        request: logData.request || null,
        requestLines,
        timestamp: moment(logData.timestampMS || Date.now()).utc().format('MMMM D, YYYY  h:mm:ss A') + ' (UTC)',
        hostname: logData.hostname || 'N/A',
        stackTrace: logData.rawStackTrace || 'None',
        webUrl,
    };

    // Deliver via email
    if (deliveryMethods.email?.addresses && deliveryMethods.email.addresses.length > 0) {
        try {
            await deliverEmailAlarm(deliveryMethods.email.addresses, alarmDetails);
            console.log(`📧 Email alarm sent to ${deliveryMethods.email.addresses.length} recipient(s)`);
        } catch (error) {
            console.error('Failed to send email alarm:', error);
        }
    }

    // Deliver via Slack
    if (deliveryMethods.slack?.webhook) {
        try {
            await deliverSlackAlarm(deliveryMethods.slack.webhook, alarmDetails);
            console.log('💬 Slack alarm sent successfully');
        } catch (error) {
            console.error('Failed to send Slack alarm:', error);
        }
    }

    // Deliver via webhook
    if (deliveryMethods.webhook?.url) {
        try {
            await deliverWebhookAlarm(deliveryMethods.webhook.url, alarmDetails);
            console.log('🔗 Webhook alarm sent successfully');
        } catch (error) {
            console.error('Failed to send webhook alarm:', error);
        }
    }
}

/**
 * Send alarm via email
 */
async function deliverEmailAlarm(
    addresses: string[],
    alarmDetails: any
): Promise<void> {
    const subject = `KeepWatch Alert: ${alarmDetails.level} in ${alarmDetails.environment}`;

    const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: rgb(14, 128, 134); color: white; padding: 20px; border-radius: 5px 5px 0 0;">
                <h2 style="margin: 0;">Log Alarm Triggered</h2>
            </div>
            <div style="background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <a href="${alarmDetails.webUrl}" style="display: inline-block; background-color: rgb(14, 128, 134); color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">View In KeepWatch</a>
                </div>
                <h3 style="color: #333; margin-top: 0;">Alert Details</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px; background-color: #fff; border: 1px solid #ddd;"><strong>Log ID:</strong></td>
                        <td style="padding: 8px; background-color: #fff; border: 1px solid #ddd; font-family: monospace;">${alarmDetails.logId}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; background-color: #fff; border: 1px solid #ddd;"><strong>Project:</strong></td>
                        <td style="padding: 8px; background-color: #fff; border: 1px solid #ddd;">${alarmDetails.projectName} (${alarmDetails.projectId})</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; background-color: #fff; border: 1px solid #ddd;"><strong>Level:</strong></td>
                        <td style="padding: 8px; background-color: #fff; border: 1px solid #ddd;"><span style="background-color:rgb(14, 128, 134); color: white; padding: 2px 8px; border-radius: 3px;">${alarmDetails.level}</span></td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; background-color: #fff; border: 1px solid #ddd;"><strong>Environment:</strong></td>
                        <td style="padding: 8px; background-color: #fff; border: 1px solid #ddd;">${alarmDetails.environment}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; background-color: #fff; border: 1px solid #ddd;"><strong>Log Type:</strong></td>
                        <td style="padding: 8px; background-color: #fff; border: 1px solid #ddd;">${alarmDetails.logType}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; background-color: #fff; border: 1px solid #ddd;"><strong>Timestamp:</strong></td>
                        <td style="padding: 8px; background-color: #fff; border: 1px solid #ddd;">${alarmDetails.timestamp}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; background-color: #fff; border: 1px solid #ddd;"><strong>Hostname:</strong></td>
                        <td style="padding: 8px; background-color: #fff; border: 1px solid #ddd;">${alarmDetails.hostname}</td>
                    </tr>
                </table>
                
                <h3 style="color: #333; margin-top: 20px;">Message</h3>
                <div style="background-color: #fff; padding: 15px; border: 1px solid #ddd; border-radius: 3px; font-family: monospace; white-space: pre-wrap; word-wrap: break-word;">${alarmDetails.message}</div>
                
                ${alarmDetails.requestLines.length > 0 ? `
                <h3 style="color: #333; margin-top: 20px;">Request</h3>
                <div style="background-color: #fff; padding: 15px; border: 1px solid #ddd; border-radius: 3px;">
                    ${alarmDetails.requestLines.map((line: any) => `<div style="font-family:sans-serif;font-size:13px;padding:2px 0"><strong>${line.key}</strong>: ${line.value}</div>`).join('')}
                </div>
                ` : ''}
                
                ${alarmDetails.stackTrace !== 'None' ? `
                <h3 style="color: #333; margin-top: 20px;">Stack Trace</h3>
                <div style="background-color: #fff; padding: 15px; border: 1px solid #ddd; border-radius: 3px; font-family: monospace; white-space: pre-wrap; word-wrap: break-word; font-size: 12px;">${alarmDetails.stackTrace}</div>
                ` : ''}
            </div>
        </div>
    `;

    await sendEmail(addresses, subject, emailContent);
}

/**
 * Send alarm via Slack
 */
async function deliverSlackAlarm(
    webhookUrl: string,
    alarmDetails: any
): Promise<void> {
    const slack = slackNotify(webhookUrl);

    const color = alarmDetails.level === 'ERROR' || alarmDetails.level === 'CRITICAL' ? 'danger' : 'warning';

    await slack.send({
        text: `🚨 *Log Alarm Triggered*\n<${alarmDetails.webUrl}|View In KeepWatch>`,
        attachments: [
            {
                fallback: `Log alarm triggered for ${alarmDetails.projectName}: ${alarmDetails.level} in ${alarmDetails.environment}`,
                color: color,
                fields: [
                    {
                        title: 'Log ID',
                        value: alarmDetails.logId,
                        short: false,
                    },
                    {
                        title: 'Project',
                        value: `${alarmDetails.projectName} (${alarmDetails.projectId})`,
                        short: true,
                    },
                    {
                        title: 'Level',
                        value: alarmDetails.level,
                        short: true,
                    },
                    {
                        title: 'Environment',
                        value: alarmDetails.environment,
                        short: true,
                    },
                    {
                        title: 'Log Type',
                        value: alarmDetails.logType,
                        short: true,
                    },
                    {
                        title: 'Timestamp',
                        value: alarmDetails.timestamp,
                        short: false,
                    },
                    {
                        title: 'Hostname',
                        value: alarmDetails.hostname,
                        short: true,
                    },
                    {
                        title: 'Message',
                        value: alarmDetails.message.substring(0, 500) + (alarmDetails.message.length > 500 ? '...' : ''),
                        short: false,
                    },
                    ...(alarmDetails.requestLines.length > 0 ? [
                        {
                            title: 'Request',
                            value: alarmDetails.requestLines.map((line: any) => `*${line.key}*: ${line.value}`).join('\n'),
                            short: false,
                        },
                    ] : []),
                ],
            },
        ],
    });
}

/**
 * Send alarm via webhook
 */
async function deliverWebhookAlarm(
    webhookUrl: string,
    alarmDetails: any
): Promise<void> {
    const payload = {
        event: 'log.alarm',
        timestamp: new Date().toISOString(),
        alarm: alarmDetails,
    };

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'KeepWatch-Alarm/1.0',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Webhook request failed with status ${response.status}`);
    }
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

    const project = await findCachedProjectById(logData.projectId);
    if (!project || !project._id) {
        throw new Error('Project not found');
    }

    const projectDocId = project._id;

    const now = new Date();
    const log: Omit<Log, '_id'> = {
        level: logData.level,
        environment: logData.environment,
        projectId: logData.projectId,
        request: logData.request,
        projectObjectId: projectDocId, // Store the Firestore document ID
        message: logData.message,
        logType: logData.logType,
        stackTrace: logData.stackTrace || [],
        rawStackTrace: logData.rawStackTrace,
        detailString: logData.detailString || null,
        details: logData.details || {},
        timestampMS: logData.timestampMS ?? Date.now(),
        createdAt: now,
        hostname: logData.hostname,
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
    const project = await findCachedProjectById(doc.projectId || projectId);
    if (!project || !project._id) {
        throw new Error(`Project not found: ${doc.projectId || projectId}`);
    }

    const projectDocId = project._id;

    return {
        _id: doc.firestoreId, // Include the Firestore document ID
        level: doc.level,
        environment: doc.environment,
        projectId: doc.projectId || projectId,
        projectObjectId: projectDocId,
        message: doc.message,
        request: doc.request,
        logType: doc.logType,
        stackTrace: doc.stackTrace || [],
        rawStackTrace: doc.rawStackTrace,
        details: doc.details || {},
        detailString: doc.detailString,
        timestampMS: doc.timestampMS,
        createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(doc.timestampMS),
        hostname: doc.hostname,
    };
}

/**
 * Get logs for a project with filtering and pagination
 * @param projectId - The projectId to get logs for
 * @param page - Page number (1-based)
 * @param pageSize - Number of logs per page
 * @param level - Optional filter by log level(s)
 * @param environment - Optional filter by environment(s)
 * @param logType - Optional filter by log type (single string: "application" or "system")
 * @param hostname - Optional filter by hostname(s) - can be a single string or array of strings
 * @param startTime - Optional start time filter (Unix timestamp in milliseconds)
 * @param endTime - Optional end time filter (Unix timestamp in milliseconds)
 * @param sortOrder - Optional sort order for timestampMS - 'asc' or 'desc' (defaults to 'desc')
 * @param docFilter - Optional document-wide filter (searches across message, rawStackTrace, and detailString)
 * @param messageFilter - Optional message filter with AND/OR logic
 * @param stackTraceFilter - Optional stack trace filter with AND/OR logic
 * @param detailsFilter - Optional details filter with AND/OR logic
 * @returns Object containing logs array, total count, page, and pageSize
 */
export async function getLogsByProjectId(
    projectId: string,
    page: number = 1,
    pageSize: number = 50,
    level?: string | string[],
    environment?: string | string[],
    logType?: string,
    hostname?: string | string[],
    startTime?: number,
    endTime?: number,
    sortOrder: 'asc' | 'desc' = 'desc',
    docFilter?: DocFilter,
    messageFilter?: MessageFilter,
    stackTraceFilter?: MessageFilter,
    detailsFilter?: MessageFilter
): Promise<{ logs: Log[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const typesenseClient = getTypesenseClient();

    // Build filter_by clause
    const filterBy: string[] = [`projectId:${projectId}`];

    if (level) {
        if (Array.isArray(level)) {
            // For multiple levels, use Typesense array syntax: level:[error,warn,info]
            filterBy.push(`level:[${level.join(',')}]`);
        } else {
            filterBy.push(`level:${level}`);
        }
    }

    if (environment) {
        if (Array.isArray(environment)) {
            // For multiple environments, use Typesense array syntax
            filterBy.push(`environment:[${environment.join(',')}]`);
        } else {
            filterBy.push(`environment:${environment}`);
        }
    }

    if (logType) {
        filterBy.push(`logType:${logType}`);
    }

    if (hostname) {
        if (Array.isArray(hostname)) {
            // For multiple hostnames, use Typesense array syntax
            filterBy.push(`hostname:[${hostname.join(',')}]`);
        } else {
            filterBy.push(`hostname:${hostname}`);
        }
    }

    // Add time range filters
    if (startTime !== undefined) {
        filterBy.push(`timestampMS:>=${startTime}`);
    }

    if (endTime !== undefined) {
        filterBy.push(`timestampMS:<=${endTime}`);
    }

    // Build search parameters
    let searchQuery = '*';
    let queryBy: string | undefined;
    let useBooleanAnd: boolean | undefined;
    let useTextSearch = false; // Track if we're using text-based search

    // Helper function to escape double quotes in search phrases
    const escapeDoubleQuotes = (str: string): string => {
        return str.replace(/"/g, '\\"');
    };

    // Handle docFilter - searches across message, rawStackTrace, and detailString
    if (docFilter) {
        const { phrase, matchType } = docFilter;
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
                // Wrap in double quotes for exact match with no typo tolerance
                // Escape any double quotes in the phrase first
                queryPart = `"${escapeDoubleQuotes(phrase)}"`;
                break;
        }

        searchQuery = queryPart;
        queryBy = 'message,rawStackTrace,detailString';
        useTextSearch = true;
    } else if (messageFilter && messageFilter.conditions.length > 0) {
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
                    // Wrap in double quotes for exact match with no typo tolerance
                    // Escape any double quotes in the phrase first
                    queryPart = `"${escapeDoubleQuotes(phrase)}"`;
                    break;
            }

            queryParts.push(queryPart);
        }

        // Join terms with spaces; enforce AND via use_boolean_and flag
        searchQuery = queryParts.join(' ');
        useBooleanAnd = messageFilter.operator === 'AND';
        queryBy = 'message';
        useTextSearch = true;
    } else if (stackTraceFilter && stackTraceFilter.conditions.length > 0) {
        // Build Typesense query for stack trace filter
        const queryParts: string[] = [];

        for (const condition of stackTraceFilter.conditions) {
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
                    // Wrap in double quotes for exact match with no typo tolerance
                    // Escape any double quotes in the phrase first
                    queryPart = `"${escapeDoubleQuotes(phrase)}"`;
                    break;
            }

            queryParts.push(queryPart);
        }

        searchQuery = queryParts.join(' ');
        useBooleanAnd = stackTraceFilter.operator === 'AND';
        queryBy = 'rawStackTrace';
        useTextSearch = true;
    } else if (detailsFilter && detailsFilter.conditions.length > 0) {
        // Build Typesense query for details filter
        const queryParts: string[] = [];

        for (const condition of detailsFilter.conditions) {
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
                    // Wrap in double quotes for exact match with no typo tolerance
                    // Escape any double quotes in the phrase first
                    queryPart = `"${escapeDoubleQuotes(phrase)}"`;
                    break;
            }

            queryParts.push(queryPart);
        }

        searchQuery = queryParts.join(' ');
        useBooleanAnd = detailsFilter.operator === 'AND';
        queryBy = 'detailString';
        useTextSearch = true;
    }

    const searchParameters: any = {
        q: searchQuery,
        filter_by: filterBy.join(' && '),
        per_page: pageSize,
        page: page,
    };

    // Only sort by timestamp if not using text-based search (sort by relevance when searching)
    if (!useTextSearch) {
        searchParameters.sort_by = `timestampMS:${sortOrder}`;
    }

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

    let hits: any[] = searchResults.hits || [];

    const total = searchResults.found || 0;
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
        // Use a UUID for Typesense's internal ID, but store the Firestore _id for retrieval
        const document = {
            id: randomUUID(),
            firestoreId: '_id' in logData ? logData._id : undefined, // Store Firestore document ID
            level: logData.level,
            environment: logData.environment,
            projectId: logData.projectId,
            message: logData.message,
            logType: logData.logType,
            stackTrace: logData.stackTrace || [],
            rawStackTrace: logData.rawStackTrace,
            details: logData.details || {},
            detailString: 'detailString' in logData ? logData.detailString : null,
            timestampMS: logData.timestampMS ?? Date.now(), // Use provided timestamp or generate one
            createdAt: 'createdAt' in logData
                ? logData.createdAt.getTime()
                : Date.now(),
            hostname: 'hostname' in logData ? logData.hostname : undefined,
            request: 'request' in logData ? logData.request : undefined
        };

        await typesenseClient.collections('logs').documents().create(document);
    } catch (error) {
        console.error('Failed to index log in Typesense:', error);
        throw error;
    }
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
 * Delete logs by their Firestore document IDs
 * @param projectId - The projectId to verify logs belong to
 * @param logIds - Array of Firestore document IDs to delete
 * @returns Number of logs deleted
 */
export async function deleteLogsByIds(
    projectId: string,
    logIds: string[]
): Promise<{ deletedCount: number }> {
    const collection = getLogsCollection();
    let deletedCount = 0;

    // Fetch and verify logs belong to the project, then delete in batches
    const batchSize = 500;
    for (let i = 0; i < logIds.length; i += batchSize) {
        const batch = collection.firestore.batch();
        const batchIds = logIds.slice(i, i + batchSize);

        for (const logId of batchIds) {
            // Verify the log exists and belongs to the project
            const logDoc = await collection.doc(logId).get();
            if (logDoc.exists) {
                const logData = logDoc.data();
                if (logData && logData.projectId === projectId) {
                    batch.delete(logDoc.ref);
                    deletedCount++;
                }
            }
        }

        await batch.commit();
    }

    // Delete from Typesense if enabled
    if (isTypesenseEnabled() && deletedCount > 0) {
        try {
            const typesenseClient = getTypesenseClient();

            // Search for documents with matching firestoreIds and delete them
            for (const logId of logIds) {
                try {
                    // Search for the Typesense document by firestoreId
                    const searchResults = await typesenseClient
                        .collections('logs')
                        .documents()
                        .search({
                            q: '*',
                            filter_by: `projectId:${projectId} && firestoreId:${logId}`,
                            per_page: 1,
                        });

                    const hits = searchResults.hits || [];
                    if (hits.length > 0) {
                        const typesenseDocId = (hits[0].document as any).id;
                        if (typesenseDocId) {
                            await typesenseClient
                                .collections('logs')
                                .documents(typesenseDocId)
                                .delete();
                        }
                    }
                } catch (error: any) {
                    // Ignore 404 errors (document already deleted or not found)
                    if (error?.httpStatus !== 404) {
                        console.error(`Error deleting Typesense document for log ${logId}:`, error);
                    }
                }
            }

            console.log(`Deleted ${deletedCount} documents from Typesense`);
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

/**
 * Get all unique environment values for a project and log type using Typesense facet search
 * @param projectId - The projectId to get environments for
 * @param logType - The log type to filter by ("application" or "system")
 * @returns Array of unique environment names with their counts
 */
export async function getEnvironmentsByProjectAndLogType(
    projectId: string,
    logType: string
): Promise<Array<{ value: string; count: number }>> {
    const typesenseClient = getTypesenseClient();

    // Build filter_by clause
    const filterBy = `projectId:${projectId} && logType:${logType}`;

    // Execute facet search
    const searchResults = await typesenseClient
        .collections('logs')
        .documents()
        .search({
            q: '*',
            query_by: 'message',
            filter_by: filterBy,
            facet_by: 'environment',
            per_page: 0, // We only need facet results, not documents
        });

    // Extract facet counts from results
    const facetCounts = searchResults.facet_counts || [];
    const environmentFacet = facetCounts.find((facet: any) => facet.field_name === 'environment');

    if (!environmentFacet || !environmentFacet.counts) {
        return [];
    }

    // Map to our return format
    return environmentFacet.counts.map((count: any) => ({
        value: count.value,
        count: count.count,
    }));
}
