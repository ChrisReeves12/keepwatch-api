import { getFirestore, toDate } from '../database/firestore.connection';
import { User, CreateUserInput, UpdateUserInput } from '../types/user.types';
import { hashPassword } from './crypt.service';
import { slugify } from '../utils/slugify.util';
import { getCache, setCache } from './redis.service';
import {
    getSubscriptionPlanEnrollmentByUserId,
    findSubscriptionPlanByMachineName,
} from './subscription.service';
import { removeUserFromAllProjects, deleteProjectsByOwnerId } from './projects.service';
import moment from 'moment';

const COLLECTION_NAME = 'users';
const DELETION_CODES_COLLECTION = 'account_deletion_codes';
const CODE_EXPIRY_MINUTES = 15;

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
    const emailVerifiedAt = data.emailVerifiedAt ? toDate(data.emailVerifiedAt) : null;
    return {
        ...data,
        _id: doc.id,
        emailVerifiedAt,
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

    const now = moment().toDate();
    const user: Omit<User, '_id'> = {
        name: userData.name,
        email: userData.email.trim().toLowerCase(),
        password: hashedPassword,
        userId,
        emailVerifiedAt: null,
        is2FARequired: userData.is2FARequired ?? false,
        createdAt: now,
        updatedAt: now,
    };

    if (userData.company) {
        (user as any).company = userData.company;
    }

    if (userData.timezone) {
        (user as any).timezone = userData.timezone;
    }

    if ((userData as any).inviteId) {
        (user as any).inviteId = (userData as any).inviteId;
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
    const snapshot = await collection.where('email', '==', email.trim().toLowerCase()).limit(1).get();

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

interface UserUsageMetadataCache {
    userCreatedAt: string;
    subscriptionPlanId: string | null;
    logLimit: number | null;
    projectLimit: number | null;
}

export interface UserUsageMetadata {
    userCreatedAt: Date;
    subscriptionPlanId: string | null;
    logLimit?: number;
    projectLimit?: number;
}

/**
 * Get user's createdAt along with subscription plan metadata.
 * Results are cached for 10 minutes to reduce repeated Firestore reads.
 * @param userId - Firestore document ID string
 * @returns Usage metadata object or null if user not found
 */
export async function getUserCreatedAtAndEnrollment(userId: string): Promise<UserUsageMetadata | null> {
    const cacheKey = `user:${userId}:usageMetadata`;

    try {
        const cachedMetadata = await getCache<UserUsageMetadataCache>(cacheKey);
        if (cachedMetadata) {
            console.log(`User usage metadata cache hit for: ${userId}`);
            return {
                userCreatedAt: new Date(cachedMetadata.userCreatedAt),
                subscriptionPlanId: cachedMetadata.subscriptionPlanId,
                logLimit: typeof cachedMetadata.logLimit === 'number' ? cachedMetadata.logLimit : undefined,
                projectLimit: typeof cachedMetadata.projectLimit === 'number' ? cachedMetadata.projectLimit : undefined,
            };
        }
    } catch (error) {
        console.error('❌ Failed to get user usage metadata from cache:', error);
    }

    console.log(`User usage metadata cache miss for: ${userId}, fetching from database`);

    const user = await findUserById(userId);

    if (!user || !user.createdAt) {
        return null;
    }

    let subscriptionPlanId: string | null = null;
    let logLimit: number | undefined;
    let projectLimit: number | undefined;

    try {
        if (user.userId) {
            const enrollment: { subscriptionPlan: string } =
                (await getSubscriptionPlanEnrollmentByUserId(user.userId)) || { subscriptionPlan: 'free' };

            if (enrollment) {
                subscriptionPlanId = enrollment.subscriptionPlan;

                const plan = await findSubscriptionPlanByMachineName(enrollment.subscriptionPlan);
                if (plan) {
                    if (typeof plan.logLimit === 'number') {
                        logLimit = plan.logLimit;
                    }
                    if (typeof plan.projectLimit === 'number') {
                        projectLimit = plan.projectLimit;
                    }
                }
            }
        }
    } catch (error) {
        console.error(`❌ Failed to fetch subscription data for user ${userId}:`, error);
    }

    const metadata: UserUsageMetadata = {
        userCreatedAt: user.createdAt,
        subscriptionPlanId,
        logLimit,
        projectLimit,
    };

    try {
        const cachePayload: UserUsageMetadataCache = {
            userCreatedAt: metadata.userCreatedAt.toISOString(),
            subscriptionPlanId: metadata.subscriptionPlanId,
            logLimit: typeof metadata.logLimit === 'number' ? metadata.logLimit : null,
            projectLimit: typeof metadata.projectLimit === 'number' ? metadata.projectLimit : null,
        };

        await setCache(cacheKey, cachePayload, 10 * 60); // 10 minutes in seconds
    } catch (error) {
        console.error('❌ Failed to cache user usage metadata:', error);
    }

    return metadata;
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
        updatedAt: moment().toDate(),
    };

    if (updateData.email) {
        updatedData.email = updateData.email.trim().toLowerCase();
    }

    if (updateData.password) {
        updatedData.password = await hashPassword(updateData.password);
    }

    await docRef.update(updatedData);

    const updatedDoc = await docRef.get();
    return toUser(updatedDoc);
}

/**
 * Mark a user's email as verified by userId
 * @param userId - The unique userId identifier
 * @returns Updated user document or null if not found
 */
export async function markEmailVerified(userId: string): Promise<User | null> {
    const collection = getUsersCollection();
    const snapshot = await collection.where('userId', '==', userId).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    const docRef = snapshot.docs[0].ref;
    const now = moment().toDate();

    await docRef.update({
        emailVerifiedAt: now,
        updatedAt: now,
    });

    const updatedDoc = await docRef.get();
    return toUser(updatedDoc);
}

/**
 * Delete a user by userId
 * This performs a cascade delete:
 * 1. Removes user from all projects they are a member of
 * 2. Deletes all projects owned by the user (and their logs)
 * 3. Deletes the user account
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

    // Step 1: Remove user from all projects they are a member of (but don't own)
    await removeUserFromAllProjects(user._id);

    // Step 2: Delete all projects owned by this user (cascade deletes logs too)
    await deleteProjectsByOwnerId(user._id);

    // Step 3: Delete the user
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

// ============================================================================
// Account Deletion Verification Functions
// ============================================================================

interface AccountDeletionCode {
    email: string;
    userId: string;
    code: string;
    expiresAt: Date;
    createdAt: Date;
    used: boolean;
}

/**
 * Get the account deletion codes collection
 */
function getDeletionCodesCollection() {
    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not connected');
    }
    return db.collection(DELETION_CODES_COLLECTION);
}

/**
 * Generate a random 6-digit code
 * @returns 6-digit code as string
 */
export function generateDeletionCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store an account deletion code for a user
 * @param email - User's email address
 * @param userId - User's userId
 * @param code - The 6-digit deletion code
 * @returns Promise resolving when code is stored
 */
export async function storeDeletionCode(email: string, userId: string, code: string): Promise<void> {
    const collection = getDeletionCodesCollection();

    const normalizedEmail = email.trim().toLowerCase();

    // Invalidate any existing codes for this user
    const existingSnapshot = await collection
        .where('userId', '==', userId)
        .where('used', '==', false)
        .get();

    const batch = getFirestore()!.batch();
    existingSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { used: true });
    });

    // Create new deletion code
    const expiresAt = moment().add(CODE_EXPIRY_MINUTES, 'minutes').toDate();
    const deletionCode: Omit<AccountDeletionCode, '_id'> = {
        email: normalizedEmail,
        userId,
        code,
        expiresAt,
        createdAt: new Date(),
        used: false,
    };

    const docRef = collection.doc();
    batch.set(docRef, deletionCode);

    await batch.commit();
}

/**
 * Validate an account deletion code
 * @param userId - User's userId
 * @param code - The 6-digit deletion code to validate
 * @returns true if code is valid and not expired, false otherwise
 */
export async function validateDeletionCode(userId: string, code: string): Promise<boolean> {
    const collection = getDeletionCodesCollection();

    // Query for the specific code
    const snapshot = await collection
        .where('userId', '==', userId)
        .where('code', '==', code)
        .where('used', '==', false)
        .get();

    if (snapshot.empty) {
        return false;
    }

    // Get the most recent code if multiple exist (shouldn't happen, but just in case)
    const docs = snapshot.docs.sort((a, b) => {
        const aData = a.data();
        const bData = b.data();
        const aCreatedAt = toDate(aData.createdAt);
        const bCreatedAt = toDate(bData.createdAt);
        return bCreatedAt.getTime() - aCreatedAt.getTime();
    });

    const doc = docs[0];
    const rawData = doc.data();

    // Convert Firestore Timestamps to Date objects
    const expiresAt = toDate(rawData.expiresAt);

    // Check if code has expired
    const now = moment();
    const expiresAtMoment = moment(expiresAt);

    if (now.isAfter(expiresAtMoment)) {
        // Mark as used since it's expired
        await doc.ref.update({ used: true });
        return false;
    }

    // Mark code as used
    await doc.ref.update({ used: true });
    return true;
}

