import 'dotenv/config';
import { CloudEvent } from '@google-cloud/functions-framework';
import { CreateLogInput } from '../types/log.types';
import { connectToFirestore } from '../database/firestore.connection';
import { createLogsTypesenseCollection } from '../services/typesense.service';
import { storeLogMessage } from '../services/logs.service';

// Initialize connections on cold start
let isInitialized = false;

// Define the Pub/Sub message structure
interface PubSubMessage {
    message: {
        data: string;
        attributes?: Record<string, string>;
    };
}

async function initialize() {
    if (isInitialized) {
        return;
    }

    console.log('🚀 Initializing log ingestion function...');
    await connectToFirestore();
    await createLogsTypesenseCollection();
    isInitialized = true;
    console.log('✅ Initialization complete');
}

/**
 * Cloud Function triggered by Pub/Sub messages on the log-ingestion topic.
 * This function processes incoming log messages and stores them in Firestore and Typesense.
 */
export async function processLogIngestion(cloudEvent: CloudEvent<PubSubMessage>): Promise<void> {
    try {
        // Initialize on first invocation
        await initialize();

        // Decode the Pub/Sub message
        const pubsubMessage = cloudEvent.data?.message;
        if (!pubsubMessage) {
            throw new Error('No Pub/Sub message found in event');
        }

        // Decode base64 message data
        const messageData = pubsubMessage.data
            ? Buffer.from(pubsubMessage.data, 'base64').toString()
            : '{}';

        const logData: CreateLogInput = JSON.parse(messageData);

        // Use shared processing logic
        await storeLogMessage(logData);
    } catch (error: any) {
        console.error('❌ Error processing log:', error.message);
        // Throwing an error will cause the function to retry (with exponential backoff)
        throw error;
    }
}

