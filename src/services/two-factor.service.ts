import { getFirestore, toDate } from '../database/firestore.connection';
import moment from 'moment';

const COLLECTION_NAME = 'two_factor_codes';
const CODE_EXPIRY_MINUTES = 15;

interface TwoFactorCode {
    email: string;
    userId: string;
    code: string;
    expiresAt: Date;
    createdAt: Date;
    used: boolean;
}

function getTwoFactorCollection() {
    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not connected');
    }
    return db.collection(COLLECTION_NAME);
}

export function generateTwoFactorCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function storeTwoFactorCode(email: string, userId: string, code: string): Promise<void> {
    const collection = getTwoFactorCollection();

    const normalizedEmail = email.trim().toLowerCase();

    const existingSnapshot = await collection
        .where('email', '==', normalizedEmail)
        .where('used', '==', false)
        .get();

    const batch = getFirestore()!.batch();
    existingSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { used: true });
    });

    const now = moment();
    const twoFactorCode: TwoFactorCode = {
        email: normalizedEmail,
        userId,
        code,
        createdAt: now.toDate(),
        expiresAt: now.clone().add(CODE_EXPIRY_MINUTES, 'minutes').toDate(),
        used: false,
    };

    const docRef = collection.doc();
    batch.set(docRef, twoFactorCode);

    await batch.commit();
}

export async function validateTwoFactorCode(email: string, code: string): Promise<{ userId: string } | null> {
    const collection = getTwoFactorCollection();

    const normalizedEmail = email.trim().toLowerCase();

    const snapshot = await collection
        .where('email', '==', normalizedEmail)
        .where('code', '==', code)
        .where('used', '==', false)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const docs = snapshot.docs.sort((a, b) => {
        const aData = a.data();
        const bData = b.data();
        const aCreatedAt = toDate(aData.createdAt);
        const bCreatedAt = toDate(bData.createdAt);
        return bCreatedAt.getTime() - aCreatedAt.getTime();
    });

    const doc = docs[0];
    const data = doc.data() as TwoFactorCode;
    const now = moment();
    const expiresAt = toDate(data.expiresAt);

    if (now.isAfter(expiresAt)) {
        await doc.ref.update({ used: true });
        return null;
    }

    await doc.ref.update({ used: true });

    return { userId: data.userId };
}

