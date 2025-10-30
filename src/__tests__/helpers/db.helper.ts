import { ObjectId } from 'mongodb';
import { connectToDatabase, getDatabase, closeDatabaseConnection } from '../../database/connection';
import { createUserIndexes, createUser } from '../../services/users.service';
import { createProjectIndexes, createProject } from '../../services/projects.service';
import { createLogIndexes } from '../../services/logs.service';
import { createLogsTypesenseCollection, getTypesenseClient } from '../../services/typesense.service';
import { User, CreateUserInput } from '../../types/user.types';
import { Project, CreateProjectInput } from '../../types/project.types';

/**
 * Setup test database connection and indexes
 */
export async function setupTestDatabase(): Promise<void> {
    await connectToDatabase();
    await createUserIndexes();
    await createProjectIndexes();
    await createLogIndexes();
    await createLogsTypesenseCollection();
}

/**
 * Cleanup test database by dropping all collections
 */
export async function cleanupTestDatabase(): Promise<void> {
    const db = getDatabase();
    if (!db) {
        return;
    }

    // Clean MongoDB collections
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
        await db.collection(collection.name).deleteMany({});
    }

    // Clean Typesense collection
    try {
        const typesenseClient = getTypesenseClient();
        const logsCollection = typesenseClient.collections('logs');
        
        // Delete all documents from Typesense
        try {
            const documents = await logsCollection.documents().search({
                q: '*',
                per_page: 250, // Maximum per page
            });
            
            if (documents.hits && documents.hits.length > 0) {
                const ids = documents.hits.map((hit: any) => hit.document.id);
                // Delete in batches
                for (const id of ids) {
                    try {
                        await logsCollection.documents(id).delete();
                    } catch (error) {
                        // Ignore not found errors
                        if (error && typeof error === 'object' && 'httpStatus' in error && error.httpStatus !== 404) {
                            throw error;
                        }
                    }
                }
            }
        } catch (error) {
            // Ignore if collection doesn't exist or is empty
            if (error && typeof error === 'object' && 'httpStatus' in error && error.httpStatus !== 404) {
                console.error('Error cleaning Typesense:', error);
            }
        }
    } catch (error) {
        // Ignore Typesense cleanup errors to prevent test failures
        console.warn('Warning: Could not clean Typesense:', error);
    }
}

/**
 * Close test database connection
 */
export async function closeTestDatabase(): Promise<void> {
    await closeDatabaseConnection();
}

/**
 * Create a test user
 * @param userData - User data (email should be unique)
 * @returns Created user
 */
export async function createTestUser(userData: CreateUserInput): Promise<User> {
    return await createUser(userData);
}

/**
 * Create a test project with a user as admin
 * @param projectData - Project data
 * @param userId - MongoDB ObjectId of the user to add as admin
 * @returns Created project
 */
export async function createTestProject(projectData: CreateProjectInput, userId: ObjectId): Promise<Project> {
    return await createProject(projectData, userId);
}

