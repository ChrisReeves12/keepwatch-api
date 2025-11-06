import 'dotenv/config';
import { PubSub } from '@google-cloud/pubsub';
import { CreateLogInput } from '../types/log.types';
import { connectToFirestore } from '../database/firestore.connection';
import { createLogsTypesenseCollection } from '../services/typesense.service';
import { storeLogMessage } from '../services/logs.service';
import { LOG_INGESTION_TOPIC, LOG_INGESTION_SUBSCRIPTION, LOG_ALARM_TOPIC } from '../constants';

/**
 * Local development worker for log ingestion.
 * This subscribes to the Pub/Sub emulator and processes messages using the same
 * logic as the production Cloud Function.
 */
async function initialize() {
    console.log('🚀 Initializing log ingestion worker (local dev)...');

    // Initialize external services
    await connectToFirestore();
    await createLogsTypesenseCollection();
    console.log('✅ External services connected for worker.');

    // The PubSub constructor automatically detects PUBSUB_EMULATOR_HOST
    const pubSubClient = new PubSub();

    const topic = pubSubClient.topic(LOG_INGESTION_TOPIC);
    const subscription = topic.subscription(LOG_INGESTION_SUBSCRIPTION);

    // Ensure the topic and subscription exist
    try {
        const [topicExists] = await topic.exists();
        if (!topicExists) {
            console.log(`Topic ${LOG_INGESTION_TOPIC} not found. This should be created by the API service.`);
            process.exit(1);
        }

        const [subscriptionExists] = await subscription.exists();
        if (!subscriptionExists) {
            console.log(`Subscription ${LOG_INGESTION_SUBSCRIPTION} not found. Creating...`);
            await topic.createSubscription(LOG_INGESTION_SUBSCRIPTION);
            console.log(`✅ Subscription ${LOG_INGESTION_SUBSCRIPTION} created.`);
        }
    } catch (error: any) {
        console.error('Error during initialization:', error.message);
        process.exit(1);
    }

    // Listen for messages
    subscription.on('message', async (message: any) => {
        try {
            const logData: CreateLogInput = JSON.parse(message.data.toString());

            // Use the same shared processing logic as the Cloud Function
            const log = await storeLogMessage(logData);
            console.log(`Processed log message: ${message.id}`);

            // After storing the log, publish to the alarm topic with logData and logId
            const alarmTopic = pubSubClient.topic(LOG_ALARM_TOPIC);
            const alarmPayload = {
                logData,
                logId: log._id,
            };

            await alarmTopic.publishMessage({
                json: alarmPayload,
            });

            console.log(`Published alarm message for log: ${log._id}`);

            // Acknowledge the message so it's not sent again
            message.ack();
        } catch (error: any) {
            console.error(`❌ Error processing message ${message.id}:`, error.message);
            // Note: Might implement a dead-letter queue later
            message.nack();
        }
    });

    // Listen for errors
    subscription.on('error', (error: Error) => {
        console.error('Received error from subscription:', error);
    });

    console.log(`🚦 Listening for messages on ${LOG_INGESTION_SUBSCRIPTION}...`);
}

// Start the worker
initialize().catch((error) => {
    console.error('Failed to initialize worker:', error);
    process.exit(1);
});
