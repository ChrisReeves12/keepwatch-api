import moment from 'moment';

import { getFirestore, toDate } from '../database/firestore.connection';
import { slugify } from '../utils/slugify.util';
import {
    SubscriptionPlan,
    CreateSubscriptionPlanInput,
    UpdateSubscriptionPlanInput,
    BillingInterval,
    SubscriptionPlanEnrollment,
    CreateSubscriptionPlanEnrollmentInput,
    UpdateSubscriptionPlanEnrollmentInput,
} from '../types/subscription.types';

const SUBSCRIPTION_PLANS_COLLECTION = 'subscriptionPlans';
const SUBSCRIPTION_PLAN_ENROLLMENTS_COLLECTION = 'subscriptionPlanEnrollments';

function getSubscriptionPlansCollection() {
    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not connected');
    }

    return db.collection(SUBSCRIPTION_PLANS_COLLECTION);
}

function toSubscriptionPlan(doc: FirebaseFirestore.DocumentSnapshot): SubscriptionPlan | null {
    if (!doc.exists) {
        return null;
    }

    const data = doc.data() as FirebaseFirestore.DocumentData;

    return {
        _id: doc.id,
        name: data.name,
        machineName: data.machineName,
        listPrice: data.listPrice,
        logLimit: typeof data.logLimit === 'number' ? data.logLimit : data.logLimit ?? null,
        projectLimit: typeof data.projectLimit === 'number' ? data.projectLimit : data.projectLimit ?? null,
        billingInterval: data.billingInterval,
        createdAt: toDate(data.createdAt ?? moment().toDate()),
        updatedAt: toDate(data.updatedAt ?? moment().toDate()),
    };
}

function getSubscriptionPlanEnrollmentsCollection() {
    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not connected');
    }

    return db.collection(SUBSCRIPTION_PLAN_ENROLLMENTS_COLLECTION);
}

function toSubscriptionPlanEnrollment(doc: FirebaseFirestore.DocumentSnapshot): SubscriptionPlanEnrollment | null {
    if (!doc.exists) {
        return null;
    }

    const data = doc.data() as FirebaseFirestore.DocumentData;

    return {
        _id: doc.id,
        userId: data.userId,
        subscriptionPlan: data.subscriptionPlan,
        price: data.price,
        createdAt: toDate(data.createdAt ?? moment().toDate()),
        updatedAt: toDate(data.updatedAt ?? moment().toDate()),
    };
}

async function findEnrollmentDocByUserId(userId: string) {
    const collection = getSubscriptionPlanEnrollmentsCollection();
    const snapshot = await collection.where('userId', '==', userId).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    return snapshot.docs[0];
}

function normalizeOptionalLimit(value?: number | null) {
    if (typeof value === 'number') {
        return value;
    }

    if (value === null) {
        return null;
    }

    return undefined;
}

async function ensureMachineNameUnique(machineName: string): Promise<void> {
    const collection = getSubscriptionPlansCollection();
    const snapshot = await collection.where('machineName', '==', machineName).limit(1).get();

    if (!snapshot.empty) {
        throw new Error(`Subscription plan with machineName "${machineName}" already exists`);
    }
}

function buildPlanData(input: CreateSubscriptionPlanInput | UpdateSubscriptionPlanInput, now: Date, isUpdate: boolean) {
    const planData: Record<string, unknown> = {};

    if ('name' in input && typeof input.name !== 'undefined') {
        planData.name = input.name;
    }

    if ('listPrice' in input && typeof input.listPrice !== 'undefined') {
        planData.listPrice = input.listPrice;
    }

    if ('billingInterval' in input && typeof input.billingInterval !== 'undefined') {
        planData.billingInterval = input.billingInterval as BillingInterval;
    }

    const logLimit = normalizeOptionalLimit(input.logLimit);
    if (logLimit !== undefined || (isUpdate && input.logLimit === null)) {
        planData.logLimit = logLimit ?? null;
    }

    const projectLimit = normalizeOptionalLimit(input.projectLimit);
    if (projectLimit !== undefined || (isUpdate && input.projectLimit === null)) {
        planData.projectLimit = projectLimit ?? null;
    }

    planData.updatedAt = now;

    if (!isUpdate) {
        planData.createdAt = now;
    }

    return planData;
}

export async function createSubscriptionPlan(input: CreateSubscriptionPlanInput): Promise<SubscriptionPlan> {
    const collection = getSubscriptionPlansCollection();
    const machineName = slugify(input.machineName);

    await ensureMachineNameUnique(machineName);

    const now = moment().toDate();
    const planData = buildPlanData(input, now, false);

    planData.machineName = machineName;

    const docRef = collection.doc();
    await docRef.set(planData);

    const doc = await docRef.get();
    const plan = toSubscriptionPlan(doc);

    if (!plan) {
        throw new Error('Failed to create subscription plan');
    }

    return plan;
}

export async function listSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    const collection = getSubscriptionPlansCollection();
    const snapshot = await collection.orderBy('listPrice', 'asc').get();

    return snapshot.docs
        .map(doc => toSubscriptionPlan(doc))
        .filter((plan): plan is SubscriptionPlan => Boolean(plan));
}

export async function findSubscriptionPlanByMachineName(machineName: string): Promise<SubscriptionPlan | null> {
    const collection = getSubscriptionPlansCollection();
    const normalizedMachineName = slugify(machineName);

    const snapshot = await collection.where('machineName', '==', normalizedMachineName).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    return toSubscriptionPlan(snapshot.docs[0]);
}

export async function updateSubscriptionPlan(machineName: string, updates: UpdateSubscriptionPlanInput): Promise<SubscriptionPlan | null> {
    const collection = getSubscriptionPlansCollection();
    const normalizedMachineName = slugify(machineName);

    const snapshot = await collection.where('machineName', '==', normalizedMachineName).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    const now = moment().toDate();
    const updateData = buildPlanData(updates, now, true);

    if (Object.keys(updateData).length === 1 && 'updatedAt' in updateData) {
        // Nothing to update
        return toSubscriptionPlan(snapshot.docs[0]);
    }

    const docRef = snapshot.docs[0].ref;
    await docRef.update(updateData);

    const updatedDoc = await docRef.get();
    return toSubscriptionPlan(updatedDoc);
}

export async function deleteSubscriptionPlan(machineName: string): Promise<boolean> {
    const collection = getSubscriptionPlansCollection();
    const normalizedMachineName = slugify(machineName);

    const snapshot = await collection.where('machineName', '==', normalizedMachineName).limit(1).get();

    if (snapshot.empty) {
        return false;
    }

    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not connected');
    }

    const batch = db.batch();
    const planDoc = snapshot.docs[0];

    batch.delete(planDoc.ref);

    const enrollmentsCollection = getSubscriptionPlanEnrollmentsCollection();
    const enrollmentSnapshot = await enrollmentsCollection.where('subscriptionPlan', '==', normalizedMachineName).get();

    enrollmentSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    await batch.commit();

    return true;
}

export async function initializeSubscriptionCollections(): Promise<void> {
    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not connected');
    }

    await Promise.all([
        db.collection(SUBSCRIPTION_PLANS_COLLECTION).limit(1).get(),
        db.collection(SUBSCRIPTION_PLAN_ENROLLMENTS_COLLECTION).limit(1).get(),
    ]);

    console.log('✅ Firestore collections ready: subscriptionPlans, subscriptionPlanEnrollments');
}

export async function createSubscriptionPlanEnrollment(input: CreateSubscriptionPlanEnrollmentInput): Promise<SubscriptionPlanEnrollment> {
    const collection = getSubscriptionPlanEnrollmentsCollection();
    const existingEnrollmentDoc = await findEnrollmentDocByUserId(input.userId);

    if (existingEnrollmentDoc) {
        throw new Error(`User "${input.userId}" already has a subscription plan enrollment`);
    }

    const normalizedPlan = slugify(input.subscriptionPlan);
    const plan = await findSubscriptionPlanByMachineName(normalizedPlan);

    if (!plan) {
        throw new Error(`Subscription plan "${normalizedPlan}" does not exist`);
    }

    const now = moment().toDate();
    const enrollmentData = {
        userId: input.userId,
        subscriptionPlan: normalizedPlan,
        price: input.price,
        createdAt: now,
        updatedAt: now,
    };

    const docRef = collection.doc();
    await docRef.set(enrollmentData);

    const doc = await docRef.get();
    const enrollment = toSubscriptionPlanEnrollment(doc);

    if (!enrollment) {
        throw new Error('Failed to create subscription plan enrollment');
    }

    return enrollment;
}

export async function getSubscriptionPlanEnrollmentByUserId(userId: string): Promise<SubscriptionPlanEnrollment | null> {
    const enrollmentDoc = await findEnrollmentDocByUserId(userId);

    if (!enrollmentDoc) {
        return null;
    }

    return toSubscriptionPlanEnrollment(enrollmentDoc);
}

export async function listSubscriptionPlanEnrollmentsByPlan(machineName: string): Promise<SubscriptionPlanEnrollment[]> {
    const collection = getSubscriptionPlanEnrollmentsCollection();
    const normalizedPlan = slugify(machineName);

    const snapshot = await collection.where('subscriptionPlan', '==', normalizedPlan).get();

    return snapshot.docs
        .map(doc => toSubscriptionPlanEnrollment(doc))
        .filter((enrollment): enrollment is SubscriptionPlanEnrollment => Boolean(enrollment));
}

export async function updateSubscriptionPlanEnrollment(
    userId: string,
    updates: UpdateSubscriptionPlanEnrollmentInput,
): Promise<SubscriptionPlanEnrollment | null> {
    const enrollmentDoc = await findEnrollmentDocByUserId(userId);

    if (!enrollmentDoc) {
        return null;
    }

    const updateData: Record<string, unknown> = {};

    if (typeof updates.price !== 'undefined') {
        updateData.price = updates.price;
    }

    if (typeof updates.subscriptionPlan !== 'undefined') {
        const normalizedPlan = slugify(updates.subscriptionPlan);
        const plan = await findSubscriptionPlanByMachineName(normalizedPlan);

        if (!plan) {
            throw new Error(`Subscription plan "${normalizedPlan}" does not exist`);
        }

        updateData.subscriptionPlan = normalizedPlan;
    }

    if (!Object.keys(updateData).length) {
        return toSubscriptionPlanEnrollment(enrollmentDoc);
    }

    updateData.updatedAt = moment().toDate();

    await enrollmentDoc.ref.update(updateData);

    const updatedDoc = await enrollmentDoc.ref.get();
    return toSubscriptionPlanEnrollment(updatedDoc);
}

export async function deleteSubscriptionPlanEnrollment(userId: string): Promise<boolean> {
    const enrollmentDoc = await findEnrollmentDocByUserId(userId);

    if (!enrollmentDoc) {
        return false;
    }

    await enrollmentDoc.ref.delete();
    return true;
}

