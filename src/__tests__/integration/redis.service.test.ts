import {
    connectToRedis,
    closeRedisConnection,
    getRedisClient,
    setCache,
    getCache,
    deleteCache,
    prefixKey,
    isCachingEnabled,
} from '../../services/redis.service';
import { setupTestRedis, cleanupTestRedis, closeTestRedis, isRedisAvailable } from '../helpers/redis.helper';

describe('Redis Service Integration Tests', () => {
    const originalEnv: Record<string, string | undefined> = {};

    beforeAll(() => {
        // Save original environment variables
        Object.keys(process.env).forEach(key => {
            originalEnv[key] = process.env[key];
        });
    });

    beforeEach(async () => {
        // Set default test Redis config (don't override if already set)
        if (!process.env.REDIS_HOST) {
            process.env.REDIS_HOST = 'localhost';
        }
        if (!process.env.REDIS_PORT) {
            process.env.REDIS_PORT = '6379';
        }
        if (!process.env.REDIS_KEY_PREFIX) {
            process.env.REDIS_KEY_PREFIX = 'keepwatch-test';
        }
        process.env.USE_CACHE = 'true';

        // Close any existing connection
        await closeRedisConnection();

        // Setup Redis for tests
        await setupTestRedis();
        await cleanupTestRedis();
    });

    afterEach(async () => {
        await cleanupTestRedis();
        await closeRedisConnection();
    });

    afterAll(async () => {
        // Restore original environment variables
        Object.keys(process.env).forEach(key => {
            if (!(key in originalEnv)) {
                delete process.env[key];
            } else {
                process.env[key] = originalEnv[key];
            }
        });
        await closeTestRedis();
    });

    describe('Connection', () => {
        it('should connect to Redis when caching is enabled', async () => {
            process.env.USE_CACHE = 'true';
            await closeRedisConnection();

            const client = await connectToRedis();
            expect(client).not.toBeNull();

            const isAvailable = await isRedisAvailable();
            if (isAvailable) {
                expect(client).toBeInstanceOf(require('ioredis'));
            }
        });

        it('should return null when caching is disabled', async () => {
            process.env.USE_CACHE = 'false';
            await closeRedisConnection();

            const client = await connectToRedis();
            expect(client).toBeNull();
        });

        it('should return existing client on subsequent calls', async () => {
            process.env.USE_CACHE = 'true';
            await closeRedisConnection();

            const client1 = await connectToRedis();
            const client2 = await connectToRedis();

            expect(client1).toBe(client2);
        });

        it('should throw error when REDIS_HOST is missing', async () => {
            delete process.env.REDIS_HOST;
            await closeRedisConnection();

            await expect(connectToRedis()).rejects.toThrow('REDIS_HOST and REDIS_PORT environment variables are required');
        });

        it('should throw error when REDIS_PORT is missing', async () => {
            delete process.env.REDIS_PORT;
            await closeRedisConnection();

            await expect(connectToRedis()).rejects.toThrow('REDIS_HOST and REDIS_PORT environment variables are required');
        });
    });

    describe('Caching Enable/Disable', () => {
        it('should enable caching by default', () => {
            delete process.env.USE_CACHE;
            expect(isCachingEnabled()).toBe(true);
        });

        it('should enable caching when USE_CACHE is "true"', () => {
            process.env.USE_CACHE = 'true';
            expect(isCachingEnabled()).toBe(true);
        });

        it('should disable caching when USE_CACHE is "false"', () => {
            process.env.USE_CACHE = 'false';
            expect(isCachingEnabled()).toBe(false);
        });

        it('should enable caching when USE_CACHE is empty string', () => {
            process.env.USE_CACHE = '';
            expect(isCachingEnabled()).toBe(true);
        });
    });

    describe('Key Prefixing', () => {
        it('should prefix keys with REDIS_KEY_PREFIX', () => {
            process.env.REDIS_KEY_PREFIX = 'test-prefix';
            const key = 'my-key';
            const prefixed = prefixKey(key);
            expect(prefixed).toBe('test-prefix:my-key');
        });

        it('should handle empty prefix', () => {
            delete process.env.REDIS_KEY_PREFIX;
            const key = 'my-key';
            const prefixed = prefixKey(key);
            expect(prefixed).toBe('my-key');
        });

        it('should handle multiple colons in key', () => {
            process.env.REDIS_KEY_PREFIX = 'test';
            const key = 'project:api-key:123';
            const prefixed = prefixKey(key);
            expect(prefixed).toBe('test:project:api-key:123');
        });
    });

    describe('Cache Operations', () => {
        beforeEach(async () => {
            const available = await isRedisAvailable();
            if (!available) {
                console.log('⚠️  Skipping cache operation tests - Redis not available');
            }
        });

        it('should set and get a simple string value', async () => {
            const available = await isRedisAvailable();
            if (!available) {
                return; // Skip test if Redis is not available
            }

            const key = 'test-string-key';
            const value = 'test-value';

            await setCache(key, value, 60);
            const result = await getCache<string>(key);

            expect(result).toBe(value);
        });

        it('should set and get an object value', async () => {
            const available = await isRedisAvailable();
            if (!available) {
                return;
            }

            const key = 'test-object-key';
            const value = { name: 'Test', id: 123, nested: { data: 'value' } };

            await setCache(key, value, 60);
            const result = await getCache<typeof value>(key);

            expect(result).toEqual(value);
        });

        it('should set and get an array value', async () => {
            const available = await isRedisAvailable();
            if (!available) {
                return;
            }

            const key = 'test-array-key';
            const value = [1, 2, 3, { nested: 'value' }];

            await setCache(key, value, 60);
            const result = await getCache<typeof value>(key);

            expect(result).toEqual(value);
        });

        it('should return null for non-existent key', async () => {
            const available = await isRedisAvailable();
            if (!available) {
                return;
            }

            const result = await getCache('non-existent-key');
            expect(result).toBeNull();
        });

        it('should delete a cached value', async () => {
            const available = await isRedisAvailable();
            if (!available) {
                return;
            }

            const key = 'test-delete-key';
            const value = 'test-value';

            await setCache(key, value, 60);
            let result = await getCache<string>(key);
            expect(result).toBe(value);

            await deleteCache(key);
            result = await getCache<string>(key);
            expect(result).toBeNull();
        });

        it('should handle TTL expiration', async () => {
            const available = await isRedisAvailable();
            if (!available) {
                return;
            }

            const key = 'test-ttl-key';
            const value = 'test-value';

            await setCache(key, value, 1); // 1 second TTL
            let result = await getCache<string>(key);
            expect(result).toBe(value);

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 1100));

            result = await getCache<string>(key);
            expect(result).toBeNull();
        }, 10000); // Increase timeout for TTL test

        it('should handle multiple keys independently', async () => {
            const available = await isRedisAvailable();
            if (!available) {
                return;
            }

            const key1 = 'test-multi-key-1';
            const key2 = 'test-multi-key-2';
            const value1 = 'value1';
            const value2 = { data: 'value2' };

            await setCache(key1, value1, 60);
            await setCache(key2, value2, 60);

            const result1 = await getCache<string>(key1);
            const result2 = await getCache<typeof value2>(key2);

            expect(result1).toBe(value1);
            expect(result2).toEqual(value2);
        });

        it('should overwrite existing cache value', async () => {
            const available = await isRedisAvailable();
            if (!available) {
                return;
            }

            const key = 'test-overwrite-key';
            const value1 = 'first-value';
            const value2 = 'second-value';

            await setCache(key, value1, 60);
            let result = await getCache<string>(key);
            expect(result).toBe(value1);

            await setCache(key, value2, 60);
            result = await getCache<string>(key);
            expect(result).toBe(value2);
        });
    });

    describe('Cache Operations with Caching Disabled', () => {
        beforeEach(() => {
            process.env.USE_CACHE = 'false';
        });

        it('should not set cache when caching is disabled', async () => {
            await setCache('test-key', 'test-value', 60);
            // Should not throw or error, just silently return
        });

        it('should return null when getting cache with caching disabled', async () => {
            const result = await getCache('test-key');
            expect(result).toBeNull();
        });

        it('should not delete cache when caching is disabled', async () => {
            await deleteCache('test-key');
            // Should not throw or error, just silently return
        });
    });

    describe('Error Handling', () => {
        it('should handle JSON serialization errors gracefully', async () => {
            const available = await isRedisAvailable();
            if (!available) {
                return;
            }

            const key = 'test-circular-key';
            // Create a circular reference
            const circular: any = { data: 'test' };
            circular.self = circular;

            // Should not throw, but may log error
            await setCache(key, circular, 60);
            // Result may be null or partial due to serialization failure
        });

        it('should handle invalid JSON in cache gracefully', async () => {
            const available = await isRedisAvailable();
            if (!available) {
                return;
            }

            const client = getRedisClient();
            if (!client) {
                return;
            }

            // Manually set invalid JSON
            const prefixedKey = prefixKey('test-invalid-json');
            await client.set(prefixedKey, 'invalid-json-{');

            // Should return null instead of throwing
            const result = await getCache('test-invalid-json');
            expect(result).toBeNull();
        });
    });

    describe('Real-world Usage Scenario', () => {
        it('should cache project lookup by API key', async () => {
            const available = await isRedisAvailable();
            if (!available) {
                return;
            }

            const apiKey = 'test-api-key-12345';
            const project = {
                _id: '507f1f77bcf86cd799439011',
                name: 'Test Project',
                projectId: 'test-project',
                users: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const cacheKey = `project:api-key:${apiKey}`;

            // Set cache
            await setCache(cacheKey, project, 300);

            // Get cache
            const cached = await getCache<typeof project>(cacheKey);
            expect(cached).not.toBeNull();
            expect(cached?.projectId).toBe(project.projectId);
            expect(cached?.name).toBe(project.name);

            // Delete cache
            await deleteCache(cacheKey);
            const afterDelete = await getCache<typeof project>(cacheKey);
            expect(afterDelete).toBeNull();
        });
    });
});

