import { getFirestore } from '../database/firestore.connection';
import { User, CreateUserInput, UpdateUserInput } from '../types/user.types';
import { hashPassword } from './crypt.service';
import { slugify } from '../utils/slugify.util';

const COLLECTION_NAME = 'users';

/**
 * Get the users collection
 */
function getUsersCollection() {
    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not connected');
    }
    return db.collection(COLLECTION_NAME);
}

/**
 * Convert Firestore document to User type
 */
function toUser(doc: FirebaseFirestore.DocumentSnapshot): User | null {
    if (!doc.exists) return null;

    const data = doc.data()!;
    return {
        ...data,
        _id: doc.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
    } as User;
}

/**
 * Create indexes for the users collection
 * Firestore creates indexes automatically for single fields
 */
export async function createUserIndexes(): Promise<void> {
    // Firestore auto-creates single-field indexes
    // For unique constraints, we handle them at the application level
    console.log('✅ Firestore auto-creates indexes for users collection');
}

/**
 * Generate a unique userId from a name
 * @param name - User's name
 * @returns Unique userId
 */
export async function generateUniqueUserId(name: string): Promise<string> {
    const baseSlug = slugify(name);
    let userId = baseSlug;
    let counter = 1;

    // Check if base slug exists, if so, try with numbers
    while (await userIdExists(userId)) {
        userId = `${baseSlug}-${counter}`;
        counter++;
    }

    return userId;
}

/**
 * Create a new user
 * @param userData - User data to create
 * @returns Created user document
 */
export async function createUser(userData: CreateUserInput): Promise<User> {
    const collection = getUsersCollection();

    // Check if email already exists
    if (await emailExists(userData.email)) {
        throw new Error('Email already exists');
    }

    const userId = await generateUniqueUserId(userData.name);
    const hashedPassword = await hashPassword(userData.password);

    const now = new Date();
    const user: Omit<User, '_id'> = {
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
        userId,
        createdAt: now,
        updatedAt: now,
    };

    if (userData.company) {
        (user as any).company = userData.company;
    }

    const docRef = await collection.add(user);
    const doc = await docRef.get();

    return toUser(doc)!;
}

/**
 * Find a user by userId
 * @param userId - The unique userId identifier
 * @returns User document or null
 */
export async function findUserByUserId(userId: string): Promise<User | null> {
    const collection = getUsersCollection();
    const snapshot = await collection.where('userId', '==', userId).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    return toUser(snapshot.docs[0]);
}

/**
 * Find a user by email
 * @param email - User email address
 * @returns User document or null
 */
export async function findUserByEmail(email: string): Promise<User | null> {
    const collection = getUsersCollection();
    const snapshot = await collection.where('email', '==', email).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    return toUser(snapshot.docs[0]);
}

/**
 * Find a user by Firestore document _id
 * @param id - Firestore document ID string
 * @returns User document or null
 */
export async function findUserById(id: string): Promise<User | null> {
    const collection = getUsersCollection();
    const doc = await collection.doc(id).get();
    return toUser(doc);
}

/**
 * Get all users (with pagination)
 * @param limit - Maximum number of users to return
 * @param skip - Number of users to skip
 * @returns Array of user documents
 */
export async function getAllUsers(limit: number = 100, skip: number = 0): Promise<User[]> {
    const collection = getUsersCollection();

    let query = collection.orderBy('createdAt', 'desc').limit(limit);

    if (skip > 0) {
        query = query.offset(skip);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => toUser(doc)!).filter(Boolean);
}

/**
 * Update a user by userId
 * @param userId - The unique userId identifier
 * @param updateData - Fields to update
 * @returns Updated user document or null
 */
export async function updateUser(userId: string, updateData: UpdateUserInput): Promise<User | null> {
    const collection = getUsersCollection();

    // Find the document first
    const snapshot = await collection.where('userId', '==', userId).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    const docRef = snapshot.docs[0].ref;

    const updatedData: any = {
        ...updateData,
        updatedAt: new Date(),
    };

    if (updateData.password) {
        updatedData.password = await hashPassword(updateData.password);
    }

    await docRef.update(updatedData);

    const updatedDoc = await docRef.get();
    return toUser(updatedDoc);
}

/**
 * Delete a user by userId
 * @param userId - The unique userId identifier
 * @returns true if user was deleted, false otherwise
 */
export async function deleteUser(userId: string): Promise<boolean> {
    const collection = getUsersCollection();

    // Find user to get their document ID
    const user = await findUserByUserId(userId);
    if (!user || !user._id) {
        return false;
    }

    // Remove user from all projects before deleting
    const { removeUserFromAllProjects } = await import('./projects.service');
    await removeUserFromAllProjects(user._id);

    // Delete the user
    const snapshot = await collection.where('userId', '==', userId).limit(1).get();

    if (snapshot.empty) {
        return false;
    }

    await snapshot.docs[0].ref.delete();
    return true;
}

/**
 * Check if a userId already exists
 * @param userId - The userId to check
 * @returns true if userId exists, false otherwise
 */
export async function userIdExists(userId: string): Promise<boolean> {
    const user = await findUserByUserId(userId);
    return user !== null;
}

/**
 * Check if an email already exists
 * @param email - The email to check
 * @returns true if email exists, false otherwise
 */
export async function emailExists(email: string): Promise<boolean> {
    const user = await findUserByEmail(email);
    return user !== null;
}
