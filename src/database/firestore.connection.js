"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteField = exports.arrayRemove = exports.arrayUnion = void 0;
exports.connectToFirestore = connectToFirestore;
exports.closeFirestoreConnection = closeFirestoreConnection;
exports.getFirestore = getFirestore;
exports.getCollection = getCollection;
exports.toDate = toDate;
exports.serverTimestamp = serverTimestamp;
const admin = __importStar(require("firebase-admin"));
let db = null;
/**
 * Connect to Firestore database
 * Automatically uses emulator in development when FIRESTORE_EMULATOR_HOST is set
 * @returns Promise<Firestore> - The Firestore instance
 */
async function connectToFirestore() {
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
        }
        else {
            console.log('✅ Successfully connected to Firestore');
        }
        console.log(`📦 Project ID: ${projectId}`);
        return db;
    }
    catch (error) {
        console.error('❌ Failed to connect to Firestore:', error);
        throw error;
    }
}
/**
 * Close Firestore connection
 */
async function closeFirestoreConnection() {
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
function getFirestore() {
    return db;
}
/**
 * Get a Firestore collection reference
 * @param collectionName - Name of the collection
 * @returns CollectionReference
 */
function getCollection(collectionName) {
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
function toDate(timestamp) {
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
function serverTimestamp() {
    return admin.firestore.FieldValue.serverTimestamp();
}
/**
 * Helper for array operations
 */
const arrayUnion = (...elements) => admin.firestore.FieldValue.arrayUnion(...elements);
exports.arrayUnion = arrayUnion;
const arrayRemove = (...elements) => admin.firestore.FieldValue.arrayRemove(...elements);
exports.arrayRemove = arrayRemove;
/**
 * Helper to delete a field
 */
const deleteField = () => admin.firestore.FieldValue.delete();
exports.deleteField = deleteField;
