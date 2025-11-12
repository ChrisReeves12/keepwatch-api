import 'dotenv/config';
import { CloudEvent } from '@google-cloud/functions-framework';
import { connectToFirestore } from '../database/firestore.connection';
import { connectToRedis, isCachingEnabled } from '../services/redis.service';
import { processLogAlarm } from '../services/logs.service';

// Initialize connections on cold start
let isInitialized = false;

// Define the Pub/Sub message structure
interface PubSubMessage {
    message: {
        data: string;
        attributes?: Record<string, string>;
    };
}

// Define the log alarm payload structure
interface LogAlarmPayload {
    logData: any;
    logId: string;
}

async function initialize() {
    if (isInitialized) {
        return;
    }

    console.log('🚀 Initializing log alarm function...');

    // Initialize external services
    await connectToFirestore();

    // Connect to Redis if caching is enabled
    if (isCachingEnabled()) {
        try {
            await connectToRedis();
        } catch (error) {
            console.warn('⚠️  Redis connection failed, continuing without cache:', error);
        }
    }

    isInitialized = true;
    console.log('✅ Initialization complete');
}

/**
 * Cloud Function triggered by Pub/Sub messages on the log-alarm topic.
 * This function processes log alarms by checking if they should trigger notifications.
 */
export async function processLogAlarmFunction(cloudEvent: CloudEvent<PubSubMessage>): Promise<void> {
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

        const payload: LogAlarmPayload = JSON.parse(messageData);
        const { logData, logId } = payload;

        if (!logData || !logId) {
            console.error('❌ Invalid payload - missing logData or logId');
            throw new Error('Invalid payload - missing logData or logId');
        }

        // Use shared processing logic
        await processLogAlarm(logData, logId);
        console.log(`✅ Processed log alarm for log: ${logId}`);
    } catch (error: any) {
        console.error('❌ Error processing log alarm:', error.message);
        // Throwing an error will cause the function to retry (with exponential backoff)
        throw error;
    }
}
