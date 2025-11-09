import moment from 'moment';

import { getFirestore, toDate } from '../database/firestore.connection';
import { hashPassword } from './crypt.service';
import {
    SystemAdmin,
    CreateSystemAdminInput,
    UpdateSystemAdminInput,
} from '../types/subscription.types';

const COLLECTION_NAME = 'systemAdmins';

function getSystemAdminsCollection() {
    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not connected');
    }

    return db.collection(COLLECTION_NAME);
}

function toSystemAdmin(doc: FirebaseFirestore.DocumentSnapshot): SystemAdmin | null {
    if (!doc.exists) {
        return null;
    }

    const data = doc.data() as SystemAdmin;

    return {
        ...data,
        _id: doc.id,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    };
}

async function findAdminDocByEmail(email: string) {
    const collection = getSystemAdminsCollection();
    const snapshot = await collection.where('email', '==', email).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    return snapshot.docs[0];
}

export async function createSystemAdmin(input: CreateSystemAdminInput): Promise<SystemAdmin> {
    const collection = getSystemAdminsCollection();
    const existingAdmin = await findAdminDocByEmail(input.email);

    if (existingAdmin) {
        throw new Error(`System admin with email "${input.email}" already exists`);
    }

    const now = moment().toDate();
    const hashedPassword = await hashPassword(input.password);

    const adminData = {
        name: input.name,
        email: input.email,
        password: hashedPassword,
        role: input.role,
        createdAt: now,
        updatedAt: now,
    };

    const docRef = collection.doc();
    await docRef.set(adminData);

    const doc = await docRef.get();
    const admin = toSystemAdmin(doc);

    if (!admin) {
        throw new Error('Failed to create system admin');
    }

    return admin;
}

export async function listSystemAdmins(): Promise<SystemAdmin[]> {
    const collection = getSystemAdminsCollection();
    const snapshot = await collection.orderBy('createdAt', 'desc').get();

    return snapshot.docs
        .map(doc => toSystemAdmin(doc))
        .filter((admin): admin is SystemAdmin => Boolean(admin));
}

export async function findSystemAdminByEmail(email: string): Promise<SystemAdmin | null> {
    const adminDoc = await findAdminDocByEmail(email);

    if (!adminDoc) {
        return null;
    }

    return toSystemAdmin(adminDoc);
}

export async function findSystemAdminById(id: string): Promise<SystemAdmin | null> {
    const collection = getSystemAdminsCollection();
    const doc = await collection.doc(id).get();

    return toSystemAdmin(doc);
}

export async function updateSystemAdmin(id: string, updates: UpdateSystemAdminInput): Promise<SystemAdmin | null> {
    const collection = getSystemAdminsCollection();
    const docRef = collection.doc(id);
    const adminDoc = await docRef.get();

    if (!adminDoc.exists) {
        return null;
    }

    const updateData: Record<string, unknown> = {};

    if (typeof updates.name !== 'undefined') {
        updateData.name = updates.name;
    }

    if (typeof updates.role !== 'undefined') {
        updateData.role = updates.role;
    }

    if (typeof updates.email !== 'undefined') {
        const existingAdmin = await findAdminDocByEmail(updates.email);
        if (existingAdmin && existingAdmin.id !== id) {
            throw new Error(`System admin with email "${updates.email}" already exists`);
        }
        updateData.email = updates.email;
    }

    if (typeof updates.password !== 'undefined') {
        updateData.password = await hashPassword(updates.password);
    }

    if (!Object.keys(updateData).length) {
        return toSystemAdmin(adminDoc);
    }

    updateData.updatedAt = moment().toDate();

    await docRef.update(updateData);

    const updatedDoc = await docRef.get();
    return toSystemAdmin(updatedDoc);
}

export async function deleteSystemAdmin(id: string): Promise<boolean> {
    const collection = getSystemAdminsCollection();
    const docRef = collection.doc(id);
    const adminDoc = await docRef.get();

    if (!adminDoc.exists) {
        return false;
    }

    await docRef.delete();
    return true;
}

export async function initializeSystemAdminsCollection(): Promise<void> {
    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not connected');
    }

    await db.collection(COLLECTION_NAME).limit(1).get();
    console.log('✅ Firestore collection ready: systemAdmins');
}

