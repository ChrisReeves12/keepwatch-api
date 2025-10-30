import { setupTestDatabase, cleanupTestDatabase, closeTestDatabase } from './helpers/db.helper';

/**
 * Global test setup - runs before all tests
 */
beforeAll(async () => {
    // Set test environment variables if not already set
    if (!process.env.MONGODB_CONNECTION_STRING) {
        process.env.MONGODB_CONNECTION_STRING = 'mongodb://admin:password@localhost:27017/keepwatch-test?authSource=admin';
    }
    if (!process.env.TYPESENSE_HOST) {
        process.env.TYPESENSE_HOST = 'localhost';
    }
    if (!process.env.TYPESENSE_PORT) {
        process.env.TYPESENSE_PORT = '8108';
    }
    if (!process.env.TYPESENSE_API_KEY) {
        process.env.TYPESENSE_API_KEY = 'typesense-dev-key';
    }
    if (!process.env.JWT_SECRET) {
        process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
    }
    if (!process.env.JWT_EXPIRY) {
        process.env.JWT_EXPIRY = '7d';
    }

    await setupTestDatabase();
});

/**
 * Cleanup after each test
 */
afterEach(async () => {
    await cleanupTestDatabase();
});

/**
 * Global test teardown - runs after all tests
 */
afterAll(async () => {
    await closeTestDatabase();
});

