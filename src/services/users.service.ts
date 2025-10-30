import { ObjectId, WithId } from 'mongodb';
import { getDatabase } from '../database/connection';
import { User, CreateUserInput, UpdateUserInput } from '../types/user.types';
import { hashPassword } from './crypt.service';
import { slugify } from '../utils/slugify.util';

const COLLECTION_NAME = 'users';

/**
 * Get the users collection
 */
function getUsersCollection() {
    const db = getDatabase();
    if (!db) {
        throw new Error('Database not connected');
    }
    return db.collection<User>(COLLECTION_NAME);
}

/**
 * Convert MongoDB document to User type
 */
function toUser(doc: WithId<User> | null): User | null {
    if (!doc) return null;
    const user = { ...doc } as User;
    user._id = doc._id.toString();
    return user;
}

/**
 * Create indexes for the users collection
 * Should be called once on application startup
 */
export async function createUserIndexes(): Promise<void> {
    try {
        const collection = getUsersCollection();

        // Create unique index on userId
        await collection.createIndex({ userId: 1 }, { unique: true });

        // Create unique index on email
        await collection.createIndex({ email: 1 }, { unique: true });

        console.log('✅ User indexes created');
    } catch (error) {
        console.error('❌ Failed to create user indexes:', error);
        throw error;
    }
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

    const userId = await generateUniqueUserId(userData.name);
    const hashedPassword = await hashPassword(userData.password);

    const now = new Date();
    const user: User = {
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
        userId,
        createdAt: now,
        updatedAt: now,
    };

    const result = await collection.insertOne(user);

    if (!result.insertedId) {
        throw new Error('Failed to create user');
    }

    const createdUser = await collection.findOne({ _id: result.insertedId });
    if (!createdUser) {
        throw new Error('Failed to retrieve created user');
    }

    return toUser(createdUser)!;
}

/**
 * Find a user by userId
 * @param userId - The unique userId identifier
 * @returns User document or null
 */
export async function findUserByUserId(userId: string): Promise<User | null> {
    const collection = getUsersCollection();
    const user = await collection.findOne({ userId });
    return toUser(user);
}

/**
 * Find a user by email
 * @param email - User email address
 * @returns User document or null
 */
export async function findUserByEmail(email: string): Promise<User | null> {
    const collection = getUsersCollection();
    const user = await collection.findOne({ email });
    return toUser(user);
}

/**
 * Find a user by MongoDB _id
 * @param id - MongoDB ObjectId string
 * @returns User document or null
 */
export async function findUserById(id: string): Promise<User | null> {
    const collection = getUsersCollection();

    if (!ObjectId.isValid(id)) {
        return null;
    }

    const user = await collection.findOne({ _id: new ObjectId(id) });
    return toUser(user);
}

/**
 * Get all users (with pagination)
 * @param limit - Maximum number of users to return
 * @param skip - Number of users to skip
 * @returns Array of user documents
 */
export async function getAllUsers(limit: number = 100, skip: number = 0): Promise<User[]> {
    const collection = getUsersCollection();
    const users = await collection
        .find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .toArray();
    return users.map(user => toUser(user)!);
}

/**
 * Update a user by userId
 * @param userId - The unique userId identifier
 * @param updateData - Fields to update
 * @returns Updated user document or null
 */
export async function updateUser(userId: string, updateData: UpdateUserInput): Promise<User | null> {
    const collection = getUsersCollection();

    const updatedData: Partial<User> = {
        ...updateData,
        updatedAt: new Date(),
    };

    if (updateData.password) {
        updatedData.password = await hashPassword(updateData.password);
    }

    const result = await collection.findOneAndUpdate(
        { userId },
        { $set: updatedData },
        { returnDocument: 'after' }
    );

    return toUser(result);
}

/**
 * Delete a user by userId
 * @param userId - The unique userId identifier
 * @returns true if user was deleted, false otherwise
 */
export async function deleteUser(userId: string): Promise<boolean> {
    const collection = getUsersCollection();
    const result = await collection.deleteOne({ userId });
    return result.deletedCount === 1;
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

