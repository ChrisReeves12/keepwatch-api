import { PubSub } from "@google-cloud/pubsub";
import { connectToFirestore } from "../database/firestore.connection";
import { connectToRedis, isCachingEnabled } from "../services/redis.service";
import { LOG_ALARM_TOPIC, LOG_ALARM_SUBSCRIPTION } from "../constants";
import { CreateLogInput } from "../types/log.types";
import { processLogAlarm } from "../services/logs.service";

async function initialize() {
    console.log('🚀 Initializing log alarm worker...');

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

    console.log('✅ External services connected for log alarm worker.');

    // The PubSub constructor automatically detects PUBSUB_EMULATOR_HOST
    const pubSubClient = new PubSub();

    const topic = pubSubClient.topic(LOG_ALARM_TOPIC);
    const subscription = topic.subscription(LOG_ALARM_SUBSCRIPTION);

    // Ensure the topic and subscription exist
    try {
        const [topicExists] = await topic.exists();
        if (!topicExists) {
            console.log(`Topic ${LOG_ALARM_TOPIC} not found. This should be created by the API service.`);
            process.exit(1);
        }

        const [subscriptionExists] = await subscription.exists();
        if (!subscriptionExists) {
            console.log(`Subscription ${LOG_ALARM_SUBSCRIPTION} not found. Creating...`);
            await topic.createSubscription(LOG_ALARM_SUBSCRIPTION);
            console.log(`✅ Subscription ${LOG_ALARM_SUBSCRIPTION} created.`);
        }
    } catch (error: any) {
        console.error('Error during initialization:', error.message);
        process.exit(1);
    }

    // Listen for messages
    subscription.on('message', async (message: any) => {
        try {
            const payload = JSON.parse(message.data.toString());
            const { logData, logId } = payload;

            if (!logData || !logId) {
                console.error(`❌ Invalid payload - missing logData or logId: ${message.id}`);
                message.ack(); // Acknowledge to prevent reprocessing
                return;
            }

            await processLogAlarm(logData, logId);
            console.log(`Processed log alarm: ${message.id} for log: ${logId}`);
            message.ack();
        } catch (error: any) {
            console.error(`❌ Error processing log alarm ${message.id}:`, error.message);
            message.nack();
        }
    });

    // Listen for errors
    subscription.on('error', (error: Error) => {
        console.error('Received error from log alarm subscription:', error);
    });

    console.log(`🚦 Listening for log alarms on ${LOG_ALARM_SUBSCRIPTION}...`);
}

initialize().catch((error) => {
    console.error('Failed to initialize log alarm worker:', error);
    process.exit(1);
});