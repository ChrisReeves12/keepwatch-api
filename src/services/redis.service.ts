import Redis, { RedisOptions } from 'ioredis';
import dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

let redisClient: Redis | null = null;

/**
 * Check if caching is enabled
 * @returns true if USE_CACHE is not set or set to "true", false if set to "false"
 */
export function isCachingEnabled(): boolean {
    const useCache = process.env.USE_CACHE;
    return useCache !== 'false';
}

/**
 * Get the Redis key prefix from environment variable
 * @returns The key prefix or empty string if not set
 */
function getKeyPrefix(): string {
    const prefix = process.env.REDIS_KEY_PREFIX;
    return prefix ? `${prefix}:` : '';
}

/**
 * Prefix a key with the configured Redis key prefix
 * @param key - The key to prefix
 * @returns The prefixed key
 */
export function prefixKey(key: string): string {
    return `${getKeyPrefix()}${key}`;
}

/**
 * Connect to Redis
 * @returns Promise<Redis | null> - The Redis client instance or null if caching is disabled
 */
export async function connectToRedis(): Promise<Redis | null> {
    if (!isCachingEnabled()) {
        return null;
    }

    if (redisClient) {
        return redisClient;
    }

    const host = process.env.REDIS_HOST;
    const port = process.env.REDIS_PORT;
    const password = process.env.REDIS_PASSWORD;
    const useTls = process.env.REDIS_TLS === 'true';

    if (!host || !port) {
        throw new Error('REDIS_HOST and REDIS_PORT environment variables are required');
    }

    try {
        const options: RedisOptions = {
            host,
            port: parseInt(port, 10),
            password: password || undefined,
            tls: useTls ? {} : undefined,
            retryStrategy: (times: number) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
        };

        redisClient = new Redis(options);

        // Handle connection events
        redisClient.on('connect', () => {
            console.log('✅ Successfully connected to Redis');
        });

        redisClient.on('error', (error) => {
            console.error('❌ Redis connection error:', error);
        });

        redisClient.on('close', () => {
            console.log('🔌 Redis connection closed');
        });

        // Wait for connection to be ready
        await redisClient.ping();

        return redisClient;
    } catch (error) {
        console.error('❌ Failed to connect to Redis:', error);
        throw error;
    }
}

/**
 * Get the current Redis client instance
 * @returns Redis | null - The Redis client or null if not connected or caching disabled
 */
export function getRedisClient(): Redis | null {
    if (!isCachingEnabled()) {
        return null;
    }
    return redisClient;
}

/**
 * Close Redis connection
 */
export async function closeRedisConnection(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        console.log('🔌 Redis connection closed');
    }
}

/**
 * Set a value in Redis with TTL
 * @param key - The key to set
 * @param value - The value to set (will be JSON stringified)
 * @param ttlSeconds - Time to live in seconds
 */
export async function setCache(key: string, value: any, ttlSeconds: number): Promise<void> {
    if (!isCachingEnabled()) {
        console.log('⚠️  Caching is disabled, skipping setCache');
        return;
    }

    const client = getRedisClient();
    if (!client) {
        console.log('⚠️  Redis client not available, skipping setCache');
        return;
    }

    try {
        const prefixedKey = prefixKey(key);
        const serializedValue = JSON.stringify(value);
        await client.setex(prefixedKey, ttlSeconds, serializedValue);
    } catch (error) {
        console.error('❌ Failed to set cache:', error);
    }
}

/**
 * Get a value from Redis
 * @param key - The key to get
 * @returns The deserialized value or null if not found
 */
export async function getCache<T>(key: string): Promise<T | null> {
    if (!isCachingEnabled()) {
        console.log('⚠️  Caching is disabled, skipping getCache');
        return null;
    }

    const client = getRedisClient();
    if (!client) {
        console.log('⚠️  Redis client not available, skipping getCache');
        return null;
    }

    try {
        const prefixedKey = prefixKey(key);
        const value = await client.get(prefixedKey);
        if (!value) {
            return null;
        }
        return JSON.parse(value) as T;
    } catch (error) {
        console.error('❌ Failed to get cache:', error);
        return null;
    }
}

/**
 * Delete a value from Redis
 * @param key - The key to delete
 */
export async function deleteCache(key: string): Promise<void> {
    if (!isCachingEnabled()) {
        return;
    }

    const client = getRedisClient();
    if (!client) {
        return;
    }

    try {
        const prefixedKey = prefixKey(key);
        await client.del(prefixedKey);
    } catch (error) {
        console.error('Failed to delete cache:', error);
    }
}

