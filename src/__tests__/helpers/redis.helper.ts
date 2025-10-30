import { connectToRedis, closeRedisConnection, getRedisClient, prefixKey } from '../../services/redis.service';
import Redis from 'ioredis';

/**
 * Setup Redis connection for tests
 */
export async function setupTestRedis(): Promise<void> {
    // Set test Redis environment variables if not already set
    if (!process.env.REDIS_HOST) {
        process.env.REDIS_HOST = 'localhost';
    }
    if (!process.env.REDIS_PORT) {
        process.env.REDIS_PORT = '6379';
    }
    // Password is optional, so we don't set it by default
    if (!process.env.REDIS_KEY_PREFIX) {
        process.env.REDIS_KEY_PREFIX = 'keepwatch-test';
    }
    // Ensure caching is enabled for tests
    if (process.env.USE_CACHE === undefined) {
        process.env.USE_CACHE = 'true';
    }

    try {
        await connectToRedis();
    } catch (error) {
        // If Redis is not available, tests will skip
        console.warn('⚠️  Redis not available for tests:', error);
    }
}

/**
 * Cleanup Redis by deleting all test keys
 */
export async function cleanupTestRedis(): Promise<void> {
    const client = getRedisClient();
    if (!client) {
        return;
    }

    try {
        const prefix = prefixKey('');
        // Get all keys with the test prefix
        const keys = await client.keys(`${prefix}*`);
        if (keys.length > 0) {
            await client.del(...keys);
        }
    } catch (error) {
        // Ignore cleanup errors
        console.warn('Warning: Could not clean Redis:', error);
    }
}

/**
 * Close Redis connection
 */
export async function closeTestRedis(): Promise<void> {
    await closeRedisConnection();
}

/**
 * Check if Redis is available for testing
 */
export async function isRedisAvailable(): Promise<boolean> {
    try {
        const client = getRedisClient();
        if (!client) {
            return false;
        }
        await client.ping();
        return true;
    } catch {
        return false;
    }
}

