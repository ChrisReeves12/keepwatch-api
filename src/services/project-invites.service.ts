import { randomBytes } from 'crypto';
import moment from 'moment';
import { getFirestore, toDate } from '../database/firestore.connection';
import { ProjectInvite } from '../types/project.types';

const COLLECTION_NAME = 'projectInvites';
const INVITE_TOKEN_LENGTH = 24;
const DEFAULT_EXPIRY_HOURS = 48;

function getProjectInvitesCollection() {
    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not connected');
    }

    return db.collection(COLLECTION_NAME);
}

function toProjectInvite(doc: FirebaseFirestore.DocumentSnapshot): ProjectInvite | null {
    if (!doc.exists) {
        return null;
    }

    const data = doc.data()!;

    return {
        _id: doc.id,
        token: data.token,
        projectId: data.projectId,
        senderUserId: data.senderUserId,
        recipientEmail: data.recipientEmail,
        recipientUserId: data.recipientUserId ?? null,
        recipientRole: data.recipientRole,
        expiresAt: toDate(data.expiresAt),
        createdAt: toDate(data.createdAt),
    };
}

function generateInviteToken(length: number = INVITE_TOKEN_LENGTH): string {
    const bytesNeeded = Math.ceil(length / 2);
    const token = randomBytes(bytesNeeded).toString('hex').slice(0, length);
    return token;
}

interface CreateProjectInviteOptions {
    projectId: string;
    senderUserId: string;
    recipientEmail: string;
    recipientUserId: string | null;
    recipientRole: 'viewer' | 'editor' | 'admin';
}

export async function createProjectInvite(options: CreateProjectInviteOptions): Promise<ProjectInvite> {
    const collection = getProjectInvitesCollection();

    const configuredExpiry = parseInt(process.env.PROJECT_INVITE_EXPIRY_HOURS ?? '', 10);
    const expiryHours = Number.isFinite(configuredExpiry) && configuredExpiry > 0
        ? configuredExpiry
        : DEFAULT_EXPIRY_HOURS;

    const createdAt = moment().toDate();
    const expiresAt = moment(createdAt).add(expiryHours, 'hours').toDate();
    const token = generateInviteToken();

    const docRef = await collection.add({
        token,
        projectId: options.projectId,
        senderUserId: options.senderUserId,
        recipientEmail: options.recipientEmail,
        recipientUserId: options.recipientUserId,
        recipientRole: options.recipientRole,
        expiresAt,
        createdAt,
    });

    const doc = await docRef.get();
    const invite = toProjectInvite(doc);

    if (!invite) {
        throw new Error('Failed to create project invite');
    }

    return invite;
}

export async function findProjectInviteById(inviteId: string): Promise<ProjectInvite | null> {
    const collection = getProjectInvitesCollection();
    const doc = await collection.doc(inviteId).get();
    return toProjectInvite(doc);
}

export async function verifyProjectInvite(
    projectId: string,
    inviteId: string,
    token: string
): Promise<ProjectInvite | null> {
    const invite = await findProjectInviteById(inviteId);

    if (!invite) {
        return null;
    }

    if (invite.projectId !== projectId) {
        return null;
    }

    if (invite.token !== token) {
        return null;
    }

    const now = moment();
    if (now.isAfter(moment(invite.expiresAt))) {
        return null;
    }

    return invite;
}


