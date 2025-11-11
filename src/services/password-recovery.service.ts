import { getFirestore, toDate } from '../database/firestore.connection';
import moment from 'moment';

const COLLECTION_NAME = 'password_recovery_codes';
const CODE_EXPIRY_MINUTES = 15;

interface PasswordRecoveryCode {
    email: string;
    code: string;
    expiresAt: Date;
    createdAt: Date;
    used: boolean;
}

/**
 * Get the password recovery codes collection
 */
function getRecoveryCodesCollection() {
    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not connected');
    }
    return db.collection(COLLECTION_NAME);
}

/**
 * Generate a random 6-digit code
 * @returns 6-digit code as string
 */
export function generateRecoveryCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store a password recovery code for an email
 * @param email - User's email address
 * @param code - The 6-digit recovery code
 * @returns Promise resolving when code is stored
 */
export async function storeRecoveryCode(email: string, code: string): Promise<void> {
    const collection = getRecoveryCodesCollection();

    const normalizedEmail = email.trim().toLowerCase();

    // Invalidate any existing codes for this email
    const existingSnapshot = await collection
        .where('email', '==', normalizedEmail)
        .where('used', '==', false)
        .get();

    const batch = getFirestore()!.batch();
    existingSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { used: true });
    });

    // Create new recovery code
    const expiresAt = moment().add(CODE_EXPIRY_MINUTES, 'minutes').toDate();
    const recoveryCode: Omit<PasswordRecoveryCode, '_id'> = {
        email: normalizedEmail,
        code,
        expiresAt,
        createdAt: new Date(),
        used: false,
    };

    const docRef = collection.doc();
    batch.set(docRef, recoveryCode);

    await batch.commit();
}

/**
 * Validate a password recovery code
 * @param email - User's email address
 * @param code - The 6-digit recovery code to validate
 * @returns true if code is valid and not expired, false otherwise
 */
export async function validateRecoveryCode(email: string, code: string): Promise<boolean> {
    const collection = getRecoveryCodesCollection();

    const normalizedEmail = email.trim().toLowerCase();

    // Query for the specific code (Firestore requires composite index for multiple where + orderBy)
    // Since we invalidate old codes, we should only have one unused code per email
    const snapshot = await collection
        .where('email', '==', normalizedEmail)
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

