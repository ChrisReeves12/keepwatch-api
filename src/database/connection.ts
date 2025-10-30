import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Connect to MongoDB database
 * @returns Promise<Db> - The database instance
 */
export async function connectToDatabase(): Promise<Db> {
    const connectionString = process.env.MONGODB_CONNECTION_STRING;

    if (!connectionString) {
        throw new Error('MONGODB_CONNECTION_STRING environment variable is not set');
    }

    // If already connected, return existing database instance
    if (db && client) {
        return db;
    }

    try {
        // Create a new MongoClient
        client = new MongoClient(connectionString);

        // Connect to the MongoDB cluster
        await client.connect();

        // Extract database name from connection string or use default
        const dbName = extractDatabaseName(connectionString) || 'keepwatch';
        db = client.db(dbName);

        console.log('✅ Successfully connected to MongoDB');
        console.log(`📦 Database: ${dbName}`);

        return db;
    } catch (error) {
        console.error('❌ Failed to connect to MongoDB:', error);
        throw error;
    }
}

/**
 * Extract database name from MongoDB connection string
 * @param connectionString - MongoDB connection string
 * @returns Database name or null
 */
function extractDatabaseName(connectionString: string): string | null {
    try {
        const url = new URL(connectionString);
        // Remove leading slash from pathname
        const dbName = url.pathname.slice(1).split('?')[0];
        return dbName || null;
    } catch {
        return null;
    }
}

/**
 * Close MongoDB connection
 */
export async function closeDatabaseConnection(): Promise<void> {
    if (client) {
        await client.close();
        client = null;
        db = null;
        console.log('🔌 MongoDB connection closed');
    }
}

/**
 * Get the current database instance
 * @returns Db | null - The database instance or null if not connected
 */
export function getDatabase(): Db | null {
    return db;
}

/**
 * Get the current MongoDB client
 * @returns MongoClient | null - The client instance or null if not connected
 */
export function getClient(): MongoClient | null {
    return client;
}

