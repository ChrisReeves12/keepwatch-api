import 'dotenv/config';
import { PubSub } from '@google-cloud/pubsub';
import * as LogsService from '../services/logs.service';
import { CreateLogInput } from '../types/log.types';
import { connectToFirestore } from '../database/firestore.connection';
import { createLogsTypesenseCollection } from '../services/typesense.service';
import { LOG_INGESTION_TOPIC, LOG_INGESTION_SUBSCRIPTION } from '../constants';

/**
 * Initializes the Pub/Sub client and sets up the subscription.
 */
async function initialize() {
    console.log('Initializing log ingestion worker...');

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
        let logData: CreateLogInput;

        try {
            logData = JSON.parse(message.data.toString());

            await Promise.all([
                LogsService.createLog(logData),
                LogsService.indexLogInSearch(logData),
            ]);

            // Acknowledge the message so it's not sent again
            message.ack();

        } catch (error: any) {
            console.error(`❌ Error processing message ${message.id}:`, error.message);
            // Todo: Might implement a dead-letter queue later
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
