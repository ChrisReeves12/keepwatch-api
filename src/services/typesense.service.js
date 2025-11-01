"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTypesenseEnabled = isTypesenseEnabled;
exports.getTypesenseClient = getTypesenseClient;
exports.createLogsTypesenseCollection = createLogsTypesenseCollection;
const typesense_1 = require("typesense");
let client = null;
function isTypesenseEnabled() {
    return process.env.USE_TYPESENSE !== 'false';
}
/**
 * Get or create Typesense client
 */
function getTypesenseClient() {
    if (!isTypesenseEnabled()) {
        throw new Error('Typesense is disabled');
    }
    if (client) {
        return client;
    }
    const nodes = [
        {
            host: process.env.TYPESENSE_HOST || 'localhost',
            port: parseInt(process.env.TYPESENSE_PORT || '8108'),
            protocol: process.env.TYPESENSE_PROTOCOL || 'http',
        },
    ];
    client = new typesense_1.Client({
        nodes,
        apiKey: process.env.TYPESENSE_API_KEY || 'typesense-dev-key',
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
            type: 'string',
        },
        {
            name: 'level',
            type: 'string',
            facet: true,
        },
        {
            name: 'environment',
            type: 'string',
            facet: true,
        },
        {
            name: 'projectId',
            type: 'string',
            facet: true,
        },
        {
            name: 'message',
            type: 'string',
        },
        {
            name: 'stackTrace',
            type: 'object[]',
            optional: true,
        },
        {
            name: 'details',
            type: 'object',
            optional: true,
        },
        {
            name: 'timestampMS',
            type: 'int64',
            sort: true,
        },
        {
            name: 'createdAt',
            type: 'int64',
            optional: true,
        },
    ],
    default_sorting_field: 'timestampMS',
};
/**
 * Ensure the logs collection exists in Typesense
 * Creates the collection if it doesn't exist
 */
async function createLogsTypesenseCollection() {
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
        }
        catch (error) {
            // Collection doesn't exist, create it
            if (error.httpStatus === 404) {
                await typesenseClient.collections().create(logsCollectionSchema);
                console.log('✅ Typesense logs collection created');
            }
            else {
                throw error;
            }
        }
    }
    catch (error) {
        console.error('❌ Failed to ensure Typesense logs collection:', error);
        throw error;
    }
}
