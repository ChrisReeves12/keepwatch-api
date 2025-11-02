import { getFirestore } from '../database/firestore.connection';
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

    // Invalidate any existing codes for this email
    const existingSnapshot = await collection
        .where('email', '==', email)
        .where('used', '==', false)
        .get();

    const batch = getFirestore()!.batch();
    existingSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { used: true });
    });

    // Create new recovery code
    const expiresAt = moment().add(CODE_EXPIRY_MINUTES, 'minutes').toDate();
    const recoveryCode: Omit<PasswordRecoveryCode, '_id'> = {
        email,
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

    // Query for the specific code (Firestore requires composite index for multiple where + orderBy)
    // Since we invalidate old codes, we should only have one unused code per email
    const snapshot = await collection
        .where('email', '==', email)
        .where('code', '==', code)
        .where('used', '==', false)
        .get();

    if (snapshot.empty) {
        return false;
    }

    // Get the most recent code if multiple exist (shouldn't happen, but just in case)
    const docs = snapshot.docs.sort((a, b) => {
        const aData = a.data() as PasswordRecoveryCode;
        const bData = b.data() as PasswordRecoveryCode;
        return bData.createdAt.getTime() - aData.createdAt.getTime();
    });

    const doc = docs[0];
    const data = doc.data() as PasswordRecoveryCode;

    // Check if code has expired
    const now = moment();
    const expiresAt = moment(data.expiresAt);

    if (now.isAfter(expiresAt)) {
        // Mark as used since it's expired
        await doc.ref.update({ used: true });
        return false;
    }

    // Mark code as used
    await doc.ref.update({ used: true });
    return true;
}

