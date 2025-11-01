"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCachingEnabled = isCachingEnabled;
exports.prefixKey = prefixKey;
exports.connectToRedis = connectToRedis;
exports.getRedisClient = getRedisClient;
exports.closeRedisConnection = closeRedisConnection;
exports.setCache = setCache;
exports.getCache = getCache;
exports.deleteCache = deleteCache;
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
// Ensure environment variables are loaded
dotenv_1.default.config();
let redisClient = null;
/**
 * Check if caching is enabled
 * @returns true if USE_CACHE is not set or set to "true", false if set to "false"
 */
function isCachingEnabled() {
    const useCache = process.env.USE_CACHE;
    return useCache !== 'false';
}
/**
 * Get the Redis key prefix from environment variable
 * @returns The key prefix or empty string if not set
 */
function getKeyPrefix() {
    const prefix = process.env.REDIS_KEY_PREFIX;
    return prefix ? `${prefix}:` : '';
}
/**
 * Prefix a key with the configured Redis key prefix
 * @param key - The key to prefix
 * @returns The prefixed key
 */
function prefixKey(key) {
    return `${getKeyPrefix()}${key}`;
}
/**
 * Connect to Redis
 * @returns Promise<Redis | null> - The Redis client instance or null if caching is disabled
 */
async function connectToRedis() {
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
        const options = {
            host,
            port: parseInt(port, 10),
            password: password || undefined,
            tls: useTls ? {} : undefined,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
        };
        redisClient = new ioredis_1.default(options);
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
    }
    catch (error) {
        console.error('❌ Failed to connect to Redis:', error);
        throw error;
    }
}
/**
 * Get the current Redis client instance
 * @returns Redis | null - The Redis client or null if not connected or caching disabled
 */
function getRedisClient() {
    if (!isCachingEnabled()) {
        return null;
    }
    return redisClient;
}
/**
 * Close Redis connection
 */
async function closeRedisConnection() {
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
async function setCache(key, value, ttlSeconds) {
    if (!isCachingEnabled()) {
        return;
    }
    const client = getRedisClient();
    if (!client) {
        return;
    }
    try {
        const prefixedKey = prefixKey(key);
        const serializedValue = JSON.stringify(value);
        await client.setex(prefixedKey, ttlSeconds, serializedValue);
    }
    catch (error) {
        console.error('Failed to set cache:', error);
    }
}
/**
 * Get a value from Redis
 * @param key - The key to get
 * @returns The deserialized value or null if not found
 */
async function getCache(key) {
    if (!isCachingEnabled()) {
        return null;
    }
    const client = getRedisClient();
    if (!client) {
        return null;
    }
    try {
        const prefixedKey = prefixKey(key);
        const value = await client.get(prefixedKey);
        if (!value) {
            return null;
        }
        return JSON.parse(value);
    }
    catch (error) {
        console.error('Failed to get cache:', error);
        return null;
    }
}
/**
 * Delete a value from Redis
 * @param key - The key to delete
 */
async function deleteCache(key) {
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
    }
    catch (error) {
        console.error('Failed to delete cache:', error);
    }
}
