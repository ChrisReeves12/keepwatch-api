import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';

let db: Firestore | null = null;

/**
 * Connect to Firestore database
 * Automatically uses emulator in development when FIRESTORE_EMULATOR_HOST is set
 * @returns Promise<Firestore> - The Firestore instance
 */
export async function connectToFirestore(): Promise<Firestore> {
    // If already connected, return existing database instance
    if (db) {
        return db;
    }

    try {
        const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIRESTORE_PROJECT_ID || 'keepwatch-dev';

        // Check if Firebase Admin is already initialized
        if (admin.apps.length === 0) {
            // Initialize Firebase Admin
            admin.initializeApp({
                projectId: projectId,
            });
        }

        // Get Firestore instance
        db = admin.firestore();

        // Configure Firestore settings
        db.settings({
            ignoreUndefinedProperties: true,
        });

        const isEmulator = process.env.FIRESTORE_EMULATOR_HOST;
        if (isEmulator) {
            console.log('✅ Successfully connected to Firestore Emulator');
            console.log(`📦 Emulator Host: ${process.env.FIRESTORE_EMULATOR_HOST}`);
        } else {
            console.log('✅ Successfully connected to Firestore');
        }
        console.log(`📦 Project ID: ${projectId}`);

        return db;
    } catch (error) {
        console.error('❌ Failed to connect to Firestore:', error);
        throw error;
    }
}

/**
 * Close Firestore connection
 */
export async function closeFirestoreConnection(): Promise<void> {
    if (db) {
        // Firestore doesn't need explicit closing, but we'll clear the reference
        db = null;
        
        // Delete the Firebase app if needed
        if (admin.apps.length > 0) {
            await Promise.all(admin.apps.map(app => app?.delete()));
        }
        
        console.log('🔌 Firestore connection closed');
    }
}

/**
 * Get the current Firestore instance
 * @returns Firestore | null - The Firestore instance or null if not connected
 */
export function getFirestore(): Firestore | null {
    return db;
}

/**
 * Get a Firestore collection reference
 * @param collectionName - Name of the collection
 * @returns CollectionReference
 */
export function getCollection(collectionName: string) {
    if (!db) {
        throw new Error('Firestore not connected. Call connectToFirestore() first.');
    }
    return db.collection(collectionName);
}

/**
 * Helper to convert Firestore Timestamp to Date
 * @param timestamp - Firestore Timestamp or Date
 * @returns Date object
 */
export function toDate(timestamp: any): Date {
    if (timestamp instanceof Date) {
        return timestamp;
    }
    if (timestamp && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    return new Date(timestamp);
}

/**
 * Helper to get server timestamp
 * Use this for createdAt/updatedAt fields
 */
export function serverTimestamp() {
    return admin.firestore.FieldValue.serverTimestamp();
}

/**
 * Helper for array operations
 */
export const arrayUnion = (...elements: any[]) => admin.firestore.FieldValue.arrayUnion(...elements);
export const arrayRemove = (...elements: any[]) => admin.firestore.FieldValue.arrayRemove(...elements);

/**
 * Helper to delete a field
 */
export const deleteField = () => admin.firestore.FieldValue.delete();




