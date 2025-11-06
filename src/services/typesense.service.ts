import { Client } from 'typesense';

let client: Client | null = null;

export function isTypesenseEnabled(): boolean {
    return process.env.USE_TYPESENSE !== 'false';
}

/**
 * Get or create Typesense client
 */
export function getTypesenseClient(apiKey?: string, host?: string, port?: number, protocol?: string): Client {
    if (!isTypesenseEnabled()) {
        throw new Error('Typesense is disabled');
    }

    if (client) {
        return client;
    }

    const nodes = [
        {
            host: host || process.env.TYPESENSE_HOST || 'localhost',
            port: port || parseInt(process.env.TYPESENSE_PORT || '8108'),
            protocol: protocol || process.env.TYPESENSE_PROTOCOL || 'http',
        },
    ];

    client = new Client({
        nodes,
        apiKey: apiKey || process.env.TYPESENSE_API_KEY || 'typesense-dev-key',
        connectionTimeoutSeconds: 2,
    });

    return client;
}

/**
 * Collection schema for logs
 */
const logsCollectionSchema = {
    name: 'logs',
    enable_nested_fields: true,
    fields: [
        {
            name: 'id',
            type: 'string' as const,
        },
        {
            name: 'logType',
            type: 'string' as const,
            facet: true,
        },
        {
            name: 'level',
            type: 'string' as const,
            facet: true,
        },
        {
            name: 'hostname',
            type: 'string' as const,
            facet: true,
        },
        {
            name: 'environment',
            type: 'string' as const,
            facet: true,
        },
        {
            name: 'projectId',
            type: 'string' as const,
            facet: true,
        },
        {
            name: 'message',
            type: 'string' as const,
        },
        {
            name: 'request',
            type: 'object' as const,
            optional: true,
        },
        {
            name: 'stackTrace',
            type: 'object[]' as const,
            optional: true,
        },
        {
            name: 'rawStackTrace',
            type: 'string' as const,
            optional: true,
        },
        {
            name: 'details',
            type: 'object' as const,
            optional: true,
        },
        {
            name: 'detailString',
            type: 'string' as const,
            optional: true,
        },
        {
            name: 'timestampMS',
            type: 'int64' as const,
            sort: true,
        },
        {
            name: 'createdAt',
            type: 'int64' as const,
            optional: true,
        },
    ],
    default_sorting_field: 'timestampMS',
};

/**
 * Ensure the logs collection exists in Typesense
 * Creates the collection if it doesn't exist
 */
export async function createLogsTypesenseCollection(): Promise<void> {
    if (!isTypesenseEnabled()) {
        console.log('⚠️ Typesense disabled; skipping collection setup');
        return;
    }

    try {
        const typesenseClient = getTypesenseClient();

        // Check if collection exists
        try {
            await typesenseClient.collections('logs').retrieve();
            console.log('✅ Typesense logs collection already exists');
        } catch (error: any) {
            // Collection doesn't exist, create it
            if (error.httpStatus === 404) {
                await typesenseClient.collections().create(logsCollectionSchema);
                console.log('✅ Typesense logs collection created');
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('❌ Failed to ensure Typesense logs collection:', error);
        throw error;
    }
}
