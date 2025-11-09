import { getFirestore, toDate } from '../database/firestore.connection';
import moment from 'moment';

const COLLECTION_NAME = 'email_verification_codes';
const CODE_EXPIRY_MINUTES = 15;

interface EmailVerificationCode {
    userId: string;
    userDocumentId?: string;
    email: string;
    code: string;
    expiresAt: Date;
    createdAt: Date;
    used: boolean;
}

function getVerificationCodesCollection() {
    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not connected');
    }
    return db.collection(COLLECTION_NAME);
}

export function generateEmailVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function storeEmailVerificationCode(
    userId: string,
    email: string,
    code: string,
    userDocumentId?: string
): Promise<void> {
    const collection = getVerificationCodesCollection();

    const existingSnapshot = await collection
        .where('userId', '==', userId)
        .where('used', '==', false)
        .get();

    const batch = getFirestore()!.batch();
    existingSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { used: true });
    });

    const expiresAt = moment().add(CODE_EXPIRY_MINUTES, 'minutes').toDate();
    const verificationCode: EmailVerificationCode = {
        userId,
        userDocumentId,
        email,
        code,
        expiresAt,
        createdAt: moment().toDate(),
        used: false,
    };

    const docRef = collection.doc();
    batch.set(docRef, verificationCode);

    await batch.commit();
}

export async function validateEmailVerificationCode(
    code: string
): Promise<{ userId: string; email: string; userDocumentId?: string } | null> {
    const collection = getVerificationCodesCollection();

    const snapshot = await collection
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
    const data = doc.data() as EmailVerificationCode;
    const expiresAt = toDate(data.expiresAt);
    const now = moment();
    const expiresAtMoment = moment(expiresAt);

    if (now.isAfter(expiresAtMoment)) {
        await doc.ref.update({ used: true });
        return null;
    }

    await doc.ref.update({ used: true });

    return {
        userId: data.userId,
        email: data.email,
        userDocumentId: data.userDocumentId,
    };
}

