import { PubSub } from '@google-cloud/pubsub';

let pubSubClient: PubSub | null = null;

/**
 * Initializes the Pub/Sub client.
 * For local development, it connects to the Pub/Sub emulator.
 * In a deployed environment, it connects to the live Pub/Sub service.
 */
function getPubSubClient(): PubSub {
    if (pubSubClient) {
        return pubSubClient;
    }

    // The PubSub constructor automatically detects the PUBSUB_EMULATOR_HOST
    // environment variable and connects to the emulator if it's set.
    // It also automatically uses the project ID from the environment.
    pubSubClient = new PubSub();

    console.log('✅ Pub/Sub client initialized');
    return pubSubClient;
}

/**
 * Publishes a message to a specific Pub/Sub topic.
 *
 * @param topicName - The name of the topic to publish to (e.g., 'log-ingestion').
 * @param message - The message payload to send. This should be an object.
 * @returns The message ID of the published message.
 */
export async function publishMessage(topicName: string, message: object): Promise<string> {
    const client = getPubSubClient();
    const dataBuffer = Buffer.from(JSON.stringify(message));

    try {
        return await client.topic(topicName).publishMessage({ data: dataBuffer });;
    } catch (error: any) {
        console.error(`Received error while publishing to topic ${topicName}:`, error.message);
        throw error;
    }
}

/**
 * Ensures a topic exists. Creates it if it doesn't.
 *
 * @param topicName The name of the topic to ensure exists.
 */
export async function ensureTopicExists(topicName: string): Promise<void> {
    const client = getPubSubClient();
    const topic = client.topic(topicName);

    try {
        const [exists] = await topic.exists();
        if (!exists) {
            console.log(`Topic ${topicName} not found. Creating...`);
            await client.createTopic(topicName);
            console.log(`✅ Topic ${topicName} created.`);
        }
    } catch (error: any) {
        console.error(`Error ensuring topic ${topicName} exists:`, error.message);
        throw error;
    }
}
