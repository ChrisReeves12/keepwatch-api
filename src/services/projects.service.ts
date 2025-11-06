import { randomBytes, randomUUID } from 'crypto';
import { Request } from 'express';
import * as ipaddr from 'ipaddr.js';
import { getFirestore, serverTimestamp, arrayUnion, arrayRemove } from '../database/firestore.connection';
import { Project, CreateProjectInput, UpdateProjectInput, ProjectUser, ProjectApiKey, UpdateApiKeyInput, ApiKeyConstraints, CreateAlarmInput, ProjectAlarm } from '../types/project.types';
import { slugify } from '../utils/slugify.util';
import { getCache, setCache, deleteCache } from './redis.service';
import { deleteLogsByProjectId } from './logs.service';

const COLLECTION_NAME = 'projects';

/**
 * Result of constraint validation
 */
export interface ConstraintValidationResult {
    valid: boolean;
    failedConstraint?: string;
    message?: string;
}

/**
 * Get the projects collection
 */
function getProjectsCollection() {
    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not connected');
    }

    return db.collection(COLLECTION_NAME);
}

/**
 * Convert Firestore document to Project type
 */
function toProject(doc: FirebaseFirestore.DocumentSnapshot): Project | null {
    if (!doc.exists) return null;

    const data = doc.data()!;
    return {
        ...data,
        _id: doc.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        apiKeys: data.apiKeys?.map((key: any) => ({
            ...key,
            createdAt: key.createdAt?.toDate() || new Date(),
        })) || [],
    } as Project;
}

/**
 * Create indexes for the projects collection
 * Firestore creates indexes automatically, but we can create composite indexes if needed
 * For now, single-field indexes are auto-created
 */
export async function createProjectIndexes(): Promise<void> {
    // Firestore auto-creates single-field indexes
    // Composite indexes would be defined in firestore.indexes.json if needed
    console.log('✅ Firestore auto-creates indexes for projects collection');
}

// ============================================================================
// API Key Constraint Validation Functions
// ============================================================================

/**
 * Extract client IP address from request
 * Handles proxy headers (X-Forwarded-For, X-Real-IP)
 */
export function extractClientIp(req: Request): string | null {
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
        // X-Forwarded-For can contain multiple IPs, take the first one (original client)
        const ips = typeof xForwardedFor === 'string'
            ? xForwardedFor.split(',').map(ip => ip.trim())
            : xForwardedFor;
        if (ips.length > 0 && ips[0]) {
            return ips[0];
        }
    }

    // Check X-Real-IP header (nginx)
    const xRealIp = req.headers['x-real-ip'];
    if (xRealIp && typeof xRealIp === 'string') {
        return xRealIp;
    }

    // Fall back to connection remote address
    if (req.socket?.remoteAddress) {
        return req.socket.remoteAddress;
    }

    // Check req.ip (Express property)
    if (req.ip) {
        return req.ip;
    }

    return null;
}

/**
 * Check if an IP address matches an allowed IP or CIDR range
 */
function isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
    try {
        // Parse the client IP
        const parsedClientIp = ipaddr.process(clientIp);

        for (const allowedEntry of allowedIps) {
            // Check if it's a CIDR range
            if (allowedEntry.includes('/')) {
                try {
                    const [rangeIp, prefixLength] = allowedEntry.split('/');
                    const parsedRangeIp = ipaddr.process(rangeIp);
                    const prefix = parseInt(prefixLength, 10);

                    // Ensure both IPs are the same type (IPv4 or IPv6)
                    if (parsedClientIp.kind() === parsedRangeIp.kind()) {
                        if (parsedClientIp.match(parsedRangeIp, prefix)) {
                            return true;
                        }
                    }
                } catch (error) {
                    console.error(`Invalid CIDR range: ${allowedEntry}`, error);
                    continue;
                }
            } else {
                // Exact IP match
                try {
                    const parsedAllowedIp = ipaddr.process(allowedEntry);

                    // Compare the IPs
                    if (parsedClientIp.toString() === parsedAllowedIp.toString()) {
                        return true;
                    }
                } catch (error) {
                    console.error(`Invalid IP address: ${allowedEntry}`, error);
                    continue;
                }
            }
        }

        return false;
    } catch (error) {
        console.error(`Error parsing client IP: ${clientIp}`, error);
        return false;
    }
}

/**
 * Validate IP restrictions
 */
function validateIpRestrictions(
    req: Request,
    constraints: ApiKeyConstraints
): ConstraintValidationResult {
    if (!constraints.ipRestrictions || !constraints.ipRestrictions.allowedIps?.length) {
        // No IP restrictions configured, pass validation
        return { valid: true };
    }

    const clientIp = extractClientIp(req);

    if (!clientIp) {
        return {
            valid: false,
            failedConstraint: 'ipRestrictions',
            message: 'Unable to determine client IP address',
        };
    }

    const allowed = isIpAllowed(clientIp, constraints.ipRestrictions.allowedIps);

    if (!allowed) {
        return {
            valid: false,
            failedConstraint: 'ipRestrictions',
            message: `API key not allowed from IP address: ${clientIp}`,
        };
    }

    return { valid: true };
}

/**
 * Validate HTTP Referer restrictions
 */
function validateRefererRestrictions(
    req: Request,
    constraints: ApiKeyConstraints
): ConstraintValidationResult {
    if (!constraints.refererRestrictions || !constraints.refererRestrictions.allowedReferers?.length) {
        // No referer restrictions configured, pass validation
        return { valid: true };
    }

    const referer = req.headers.referer || req.headers.referrer;

    if (!referer) {
        return {
            valid: false,
            failedConstraint: 'refererRestrictions',
            message: 'Referer header is required but missing',
        };
    }

    const refererStr = typeof referer === 'string' ? referer : referer[0];
    const allowedReferers = constraints.refererRestrictions.allowedReferers;

    // Check if referer matches any allowed pattern
    const isAllowed = allowedReferers.some(pattern => {
        // Convert wildcard pattern to regex
        const regexPattern = pattern
            .replace(/\./g, '\\.')  // Escape dots
            .replace(/\*/g, '.*');  // Convert * to .*

        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(refererStr);
    });

    if (!isAllowed) {
        return {
            valid: false,
            failedConstraint: 'refererRestrictions',
            message: `API key not allowed from referer: ${refererStr}`,
        };
    }

    return { valid: true };
}

/**
 * Validate expiration date
 */
function validateExpirationDate(
    constraints: ApiKeyConstraints
): ConstraintValidationResult {
    if (!constraints.expirationDate) {
        // No expiration configured, pass validation
        return { valid: true };
    }

    const now = new Date();
    const expirationDate = new Date(constraints.expirationDate);

    if (now > expirationDate) {
        return {
            valid: false,
            failedConstraint: 'expirationDate',
            message: `API key expired on ${expirationDate.toISOString()}`,
        };
    }

    return { valid: true };
}

/**
 * Validate allowed environments
 */
function validateAllowedEnvironments(
    req: Request,
    constraints: ApiKeyConstraints
): ConstraintValidationResult {
    if (!constraints.allowedEnvironments || !constraints.allowedEnvironments.length) {
        // No environment restrictions configured, pass validation
        return { valid: true };
    }

    // The environment is part of the log data in the request body
    const environment = (req.body as any)?.environment;

    if (!environment) {
        return {
            valid: false,
            failedConstraint: 'allowedEnvironments',
            message: 'Environment is required but missing from request',
        };
    }

    if (!constraints.allowedEnvironments.includes(environment)) {
        return {
            valid: false,
            failedConstraint: 'allowedEnvironments',
            message: `API key not allowed for environment: ${environment}`,
        };
    }

    return { valid: true };
}

/**
 * Validate origin restrictions
 */
function validateOriginRestrictions(
    req: Request,
    constraints: ApiKeyConstraints
): ConstraintValidationResult {
    if (!constraints.originRestrictions || !constraints.originRestrictions.allowedOrigins?.length) {
        // No origin restrictions configured, pass validation
        return { valid: true };
    }

    const origin = req.headers.origin;

    if (!origin) {
        return {
            valid: false,
            failedConstraint: 'originRestrictions',
            message: 'Origin header is required but missing',
        };
    }

    const originStr = typeof origin === 'string' ? origin : origin[0];
    const allowedOrigins = constraints.originRestrictions.allowedOrigins;

    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(pattern => {
        // Convert wildcard pattern to regex
        const regexPattern = pattern
            .replace(/\./g, '\\.')  // Escape dots
            .replace(/\*/g, '.*');  // Convert * to .*

        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(originStr);
    });

    if (!isAllowed) {
        return {
            valid: false,
            failedConstraint: 'originRestrictions',
            message: `API key not allowed from origin: ${originStr}`,
        };
    }

    return { valid: true };
}

/**
 * Validate user agent restrictions
 */
function validateUserAgentRestrictions(
    req: Request,
    constraints: ApiKeyConstraints
): ConstraintValidationResult {
    if (!constraints.userAgentRestrictions || !constraints.userAgentRestrictions.allowedPatterns?.length) {
        // No user agent restrictions configured, pass validation
        return { valid: true };
    }

    const userAgent = req.headers['user-agent'];

    if (!userAgent) {
        return {
            valid: false,
            failedConstraint: 'userAgentRestrictions',
            message: 'User-Agent header is required but missing',
        };
    }

    const userAgentStr = typeof userAgent === 'string' ? userAgent : userAgent[0];
    const allowedPatterns = constraints.userAgentRestrictions.allowedPatterns;

    // Check if user agent matches any allowed pattern
    const isAllowed = allowedPatterns.some(pattern => {
        try {
            const regex = new RegExp(pattern, 'i');
            return regex.test(userAgentStr);
        } catch (error) {
            console.error(`Invalid user agent regex pattern: ${pattern}`, error);
            return false;
        }
    });

    if (!isAllowed) {
        return {
            valid: false,
            failedConstraint: 'userAgentRestrictions',
            message: 'API key not allowed for this user agent',
        };
    }

    return { valid: true };
}

/**
 * Validate all constraints for an API key
 * All constraints must pass (AND logic)
 */
export function validateApiKeyConstraints(
    req: Request,
    apiKey: ProjectApiKey
): ConstraintValidationResult {
    // If no constraints are configured, allow the request
    if (!apiKey.constraints) {
        return { valid: true };
    }

    const constraints = apiKey.constraints;

    // Validate each constraint type (all must pass)
    const validations = [
        validateIpRestrictions(req, constraints),
        validateRefererRestrictions(req, constraints),
        validateExpirationDate(constraints),
        validateAllowedEnvironments(req, constraints),
        validateOriginRestrictions(req, constraints),
        validateUserAgentRestrictions(req, constraints),
    ];

    // Find the first failed constraint
    const failedValidation = validations.find(v => !v.valid);

    if (failedValidation) {
        return failedValidation;
    }

    return { valid: true };
}

/**
 * Validate constraint configuration format
 * Returns error message if invalid, null if valid
 */
export function validateConstraintConfiguration(constraints: ApiKeyConstraints): string | null {
    // Validate IP restrictions
    if (constraints.ipRestrictions) {
        if (!Array.isArray(constraints.ipRestrictions.allowedIps)) {
            return 'ipRestrictions.allowedIps must be an array';
        }

        if (constraints.ipRestrictions.allowedIps.length === 0) {
            return 'ipRestrictions.allowedIps cannot be empty';
        }

        // Validate each IP/CIDR entry
        for (const entry of constraints.ipRestrictions.allowedIps) {
            if (typeof entry !== 'string') {
                return 'Each IP/CIDR entry must be a string';
            }

            try {
                if (entry.includes('/')) {
                    // Validate CIDR notation
                    const [ip, prefix] = entry.split('/');
                    ipaddr.process(ip); // Validate IP part
                    const prefixNum = parseInt(prefix, 10);
                    if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > 128) {
                        return `Invalid CIDR prefix length: ${prefix}`;
                    }
                } else {
                    // Validate single IP
                    ipaddr.process(entry);
                }
            } catch (error) {
                return `Invalid IP address or CIDR range: ${entry}`;
            }
        }
    }

    // Validate referer restrictions
    if (constraints.refererRestrictions) {
        if (!Array.isArray(constraints.refererRestrictions.allowedReferers)) {
            return 'refererRestrictions.allowedReferers must be an array';
        }

        if (constraints.refererRestrictions.allowedReferers.length === 0) {
            return 'refererRestrictions.allowedReferers cannot be empty';
        }

        for (const referer of constraints.refererRestrictions.allowedReferers) {
            if (typeof referer !== 'string') {
                return 'Each referer pattern must be a string';
            }
        }
    }

    // Validate rate limits
    if (constraints.rateLimits) {
        const { requestsPerMinute, requestsPerHour, requestsPerDay } = constraints.rateLimits;

        if (requestsPerMinute !== undefined) {
            if (typeof requestsPerMinute !== 'number' || requestsPerMinute < 1) {
                return 'rateLimits.requestsPerMinute must be a positive number';
            }
        }

        if (requestsPerHour !== undefined) {
            if (typeof requestsPerHour !== 'number' || requestsPerHour < 1) {
                return 'rateLimits.requestsPerHour must be a positive number';
            }
        }

        if (requestsPerDay !== undefined) {
            if (typeof requestsPerDay !== 'number' || requestsPerDay < 1) {
                return 'rateLimits.requestsPerDay must be a positive number';
            }
        }
    }

    // Validate expiration date
    if (constraints.expirationDate) {
        const expirationDate = new Date(constraints.expirationDate);
        if (isNaN(expirationDate.getTime())) {
            return 'expirationDate must be a valid date';
        }
    }

    // Validate allowed environments
    if (constraints.allowedEnvironments) {
        if (!Array.isArray(constraints.allowedEnvironments)) {
            return 'allowedEnvironments must be an array';
        }

        if (constraints.allowedEnvironments.length === 0) {
            return 'allowedEnvironments cannot be empty';
        }

        for (const env of constraints.allowedEnvironments) {
            if (typeof env !== 'string') {
                return 'Each environment must be a string';
            }
        }
    }

    // Validate origin restrictions
    if (constraints.originRestrictions) {
        if (!Array.isArray(constraints.originRestrictions.allowedOrigins)) {
            return 'originRestrictions.allowedOrigins must be an array';
        }

        if (constraints.originRestrictions.allowedOrigins.length === 0) {
            return 'originRestrictions.allowedOrigins cannot be empty';
        }

        for (const origin of constraints.originRestrictions.allowedOrigins) {
            if (typeof origin !== 'string') {
                return 'Each origin pattern must be a string';
            }
        }
    }

    // Validate user agent restrictions
    if (constraints.userAgentRestrictions) {
        if (!Array.isArray(constraints.userAgentRestrictions.allowedPatterns)) {
            return 'userAgentRestrictions.allowedPatterns must be an array';
        }

        if (constraints.userAgentRestrictions.allowedPatterns.length === 0) {
            return 'userAgentRestrictions.allowedPatterns cannot be empty';
        }

        for (const pattern of constraints.userAgentRestrictions.allowedPatterns) {
            if (typeof pattern !== 'string') {
                return 'Each user agent pattern must be a string';
            }

            // Validate regex pattern
            try {
                new RegExp(pattern);
            } catch (error) {
                return `Invalid regex pattern: ${pattern}`;
            }
        }
    }

    return null; // All validations passed
}

// ============================================================================
// End of API Key Constraint Validation Functions
// ============================================================================

/**
 * Generate a unique projectId from a name
 * @param name - Project's name
 * @returns Unique projectId
 */
export async function generateUniqueProjectId(name: string): Promise<string> {
    const baseSlug = slugify(name);
    let projectId = baseSlug;
    let counter = 1;

    // Check if base slug exists, if so, try with numbers
    while (await projectIdExists(projectId)) {
        projectId = `${baseSlug}-${counter}`;
        counter++;
    }

    return projectId;
}

/**
 * Create a new project
 * @param projectData - Project data to create
 * @param creatorUserId - Document ID of the user creating the project
 * @returns Created project document
 */
export async function createProject(projectData: CreateProjectInput, creatorUserId: string): Promise<Project> {
    const collection = getProjectsCollection();

    // Generate unique projectId from name
    const projectId = await generateUniqueProjectId(projectData.name);

    // Create project user with creator as admin
    const creatorUser: ProjectUser = {
        id: creatorUserId,
        role: 'admin',
    };

    const now = new Date();
    const project: Omit<Project, '_id'> = {
        name: projectData.name,
        description: projectData.description,
        projectId,
        users: [creatorUser],
        createdAt: now,
        updatedAt: now,
    };

    const docRef = await collection.add(project);
    const doc = await docRef.get();

    return toProject(doc)!;
}

/**
 * Find a project by projectId
 * @param projectId - The unique projectId identifier
 * @returns Project document or null
 */
export async function findProjectByProjectId(projectId: string): Promise<Project | null> {
    const collection = getProjectsCollection();
    const snapshot = await collection.where('projectId', '==', projectId).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    return toProject(snapshot.docs[0]);
}

/**
 * Find a cached project by projectId
 * Cache TTL is 5 minutes (300 seconds)
 * @param projectId - The unique projectId identifier
 * @returns Project document or null
 */
export async function findCachedProjectById(projectId: string): Promise<Project | null> {
    const cacheKey = `project:${projectId}`;

    try {
        const cachedProject = await getCache<Project>(cacheKey);
        if (cachedProject) {
            console.log(`Project cache hit for: ${projectId}`);
            return cachedProject;
        }
    } catch (error) {
        console.error('Failed to get project from cache:', error);
    }

    console.log(`Project cache miss for: ${projectId}, fetching from database`);

    const project = await findProjectByProjectId(projectId);

    if (project) {
        try {
            await setCache(cacheKey, project, 300); // 5 minutes TTL
        } catch (error) {
            console.error('Failed to cache project:', error);
        }
    }

    return project;
}

/**
 * Find a project by Firestore document _id
 * @param id - Firestore document ID string
 * @returns Project document or null
 */
export async function findProjectById(id: string): Promise<Project | null> {
    const collection = getProjectsCollection();
    const doc = await collection.doc(id).get();
    return toProject(doc);
}

/**
 * Get all projects for a specific user
 * @param userId - Document ID of the user
 * @returns Array of project documents
 */
export async function getProjectsByUserId(userId: string): Promise<Project[]> {
    const collection = getProjectsCollection();

    // The query now works because we created the composite index
    const adminSnapshot = await collection
        .where('users', 'array-contains', { id: userId, role: 'admin' })
        .orderBy('createdAt', 'desc')
        .get();

    const memberSnapshot = await collection
        .where('users', 'array-contains', { id: userId, role: 'member' })
        .orderBy('createdAt', 'desc')
        .get();

    const viewerSnapshot = await collection
        .where('users', 'array-contains', { id: userId, role: 'viewer' })
        .orderBy('createdAt', 'desc')
        .get();

    const allDocs = [...adminSnapshot.docs, ...memberSnapshot.docs, ...viewerSnapshot.docs];

    // Remove duplicates (a user could be in a project with multiple roles, though unlikely with current logic)
    const uniqueDocs = allDocs.filter((doc, index, self) =>
        index === self.findIndex((d) => d.id === doc.id)
    );

    const projects = uniqueDocs.map(doc => toProject(doc)!).filter(Boolean);

    return projects;
}

/**
 * Get all projects (with pagination)
 * @param limit - Maximum number of projects to return
 * @param skip - Number of projects to skip
 * @returns Array of project documents
 */
export async function getAllProjects(limit: number = 100, skip: number = 0): Promise<Project[]> {
    const collection = getProjectsCollection();

    let query = collection.orderBy('createdAt', 'desc').limit(limit);

    // Firestore doesn't have skip, but we can use offset
    if (skip > 0) {
        query = query.offset(skip);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => toProject(doc)!).filter(Boolean);
}

/**
 * Update a project by projectId
 * @param projectId - The unique projectId identifier
 * @param updateData - Fields to update
 * @returns Updated project document or null
 */
export async function updateProject(projectId: string, updateData: UpdateProjectInput): Promise<Project | null> {
    const collection = getProjectsCollection();

    // Find the document first
    const snapshot = await collection.where('projectId', '==', projectId).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    const docRef = snapshot.docs[0].ref;

    await docRef.update({
        ...updateData,
        updatedAt: new Date(),
    });

    // Invalidate cache after update
    await deleteCache(`project:${projectId}`);

    const updatedDoc = await docRef.get();
    return toProject(updatedDoc);
}

/**
 * Delete a project by projectId
 * Also deletes all logs associated with the project (cascading delete)
 * @param projectId - The unique projectId identifier
 * @returns true if project was deleted, false otherwise
 */
export async function deleteProject(projectId: string): Promise<boolean> {
    const collection = getProjectsCollection();
    const snapshot = await collection.where('projectId', '==', projectId).limit(1).get();

    if (snapshot.empty) {
        return false;
    }

    // Delete all logs associated with this project (cascading delete)
    const { deletedCount } = await deleteLogsByProjectId(projectId);

    // Delete the project
    await snapshot.docs[0].ref.delete();

    // Invalidate cache after deletion
    await deleteCache(`project:${projectId}`);

    console.log(`✅ Deleted project: ${projectId}`);

    return true;
}

/**
 * Check if a projectId already exists
 * @param projectId - The projectId to check
 * @returns true if projectId exists, false otherwise
 */
export async function projectIdExists(projectId: string): Promise<boolean> {
    const project = await findProjectByProjectId(projectId);
    return project !== null;
}

/**
 * Remove a user from all projects
 * Called when a user is deleted
 * @param userId - Document ID of the user to remove
 */
export async function removeUserFromAllProjects(userId: string): Promise<void> {
    const collection = getProjectsCollection();

    // Get all projects
    const snapshot = await collection.get();

    // Update each project that has this user
    const batch = getFirestore()!.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
        const project = toProject(doc);
        if (project && project.users.some(u => u.id === userId)) {
            const updatedUsers = project.users.filter(u => u.id !== userId);
            batch.update(doc.ref, {
                users: updatedUsers,
                updatedAt: new Date(),
            });
            batchCount++;

            // Firestore batch limit is 500 operations
            if (batchCount >= 500) {
                await batch.commit();
                batchCount = 0;
            }
        }
    }

    if (batchCount > 0) {
        await batch.commit();
    }
}

/**
 * Generate a random API key string
 * @returns string
 */
function generateApiKey(length: number = 40): string {
    let apiKey = '';
    while (apiKey.length < length) {
        const bytes = randomBytes(32);
        const base64 = bytes.toString('base64').replace(/[+/=]/g, '');
        apiKey += base64;
    }

    return apiKey.substring(0, length);
}

/**
 * Create a new API key for a project
 * @param projectId - The unique projectId identifier
 * @returns Created API key or null if project not found
 */
export async function createProjectApiKey(projectId: string): Promise<ProjectApiKey | null> {
    const collection = getProjectsCollection();

    // Find the project
    const snapshot = await collection.where('projectId', '==', projectId).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    const docRef = snapshot.docs[0].ref;
    const apiKeyString = generateApiKey();
    const apiKeyId = randomUUID();
    const now = new Date();

    const newApiKey: ProjectApiKey = {
        id: apiKeyId,
        key: apiKeyString,
        createdAt: now,
        constraints: {},
    };

    // Add to apiKeys array
    await docRef.update({
        apiKeys: arrayUnion(newApiKey),
        updatedAt: now,
    });

    // Invalidate cache after update
    await deleteCache(`project:${projectId}`);

    return newApiKey;
}

/**
 * Get all API keys for a project
 * @param projectId - The unique projectId identifier
 * @returns Array of API keys or null if project not found
 */
export async function getProjectApiKeys(projectId: string): Promise<ProjectApiKey[] | null> {
    const project = await findProjectByProjectId(projectId);
    if (!project) {
        return null;
    }
    return project.apiKeys || [];
}

/**
 * Delete an API key from a project
 * @param projectId - The unique projectId identifier
 * @param apiKeyId - The unique identifier of the API key to delete
 * @returns true if API key was deleted, false otherwise
 */
export async function deleteProjectApiKey(projectId: string, apiKeyId: string): Promise<boolean> {
    const collection = getProjectsCollection();

    // Find the project
    const snapshot = await collection.where('projectId', '==', projectId).limit(1).get();

    if (snapshot.empty) {
        return false;
    }

    const docRef = snapshot.docs[0].ref;
    const project = toProject(snapshot.docs[0]);

    if (!project) {
        return false;
    }

    // Find the API key to remove
    const apiKeyToRemove = project.apiKeys?.find(ak => ak.id === apiKeyId);
    if (!apiKeyToRemove) {
        return false;
    }

    // Remove from apiKeys array
    await docRef.update({
        apiKeys: arrayRemove(apiKeyToRemove),
        updatedAt: new Date(),
    });

    // Invalidate cache after update
    await deleteCache(`project:${projectId}`);

    return true;
}

/**
 * Find a project by API key
 * Used for API key authentication
 * @param apiKey - The API key string to search for
 * @returns Project document or null
 */
export async function findProjectByApiKey(apiKey: string): Promise<Project | null> {
    const cacheKey = `project:api-key:${apiKey}`;
    const cachedProject = await getCache<Project>(cacheKey);
    if (cachedProject) {
        return cachedProject;
    }

    const collection = getProjectsCollection();

    // Get all projects and search for the API key
    // Note: Firestore doesn't support deep array queries easily
    const snapshot = await collection.get();

    for (const doc of snapshot.docs) {
        const project = toProject(doc);
        if (project && project.apiKeys?.some(ak => ak.key === apiKey)) {
            await setCache(cacheKey, project, 300); // 5-minute cache
            return project;
        }
    }

    return null;
}

/**
 * Update a user's role on a project
 * @param projectId - The unique projectId identifier
 * @param userId - Document ID of the user whose role will be updated
 * @param newRole - The new role to assign ('viewer' | 'editor' | 'admin')
 * @returns Updated project document or null if project or user not found
 */
export async function updateUserRoleOnProject(
    projectId: string,
    userId: string,
    newRole: 'viewer' | 'editor' | 'admin'
): Promise<Project | null> {
    const collection = getProjectsCollection();

    // Find the project
    const snapshot = await collection.where('projectId', '==', projectId).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    const docRef = snapshot.docs[0].ref;
    const project = toProject(snapshot.docs[0]);

    if (!project) {
        return null;
    }

    // Find and update the user
    const userIndex = project.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return null;
    }

    const updatedUsers = [...project.users];
    updatedUsers[userIndex] = { ...updatedUsers[userIndex], role: newRole };

    await docRef.update({
        users: updatedUsers,
        updatedAt: new Date(),
    });

    // Invalidate cache after update
    await deleteCache(`project:${projectId}`);

    const updatedDoc = await docRef.get();
    return toProject(updatedDoc);
}

/**
 * Update an API key's configuration (e.g., constraints)
 * @param projectId - The unique projectId identifier
 * @param apiKeyId - The unique identifier of the API key to update
 * @param updateData - Fields to update on the API key
 * @returns Updated API key or null if project or API key not found
 */
export async function updateApiKey(
    projectId: string,
    apiKeyId: string,
    updateData: UpdateApiKeyInput
): Promise<ProjectApiKey | null> {
    const collection = getProjectsCollection();

    // Validate constraints if provided
    if (updateData.constraints) {
        const validationError = validateConstraintConfiguration(updateData.constraints);
        if (validationError) {
            throw new Error(validationError);
        }
    }

    // Find the project
    const snapshot = await collection.where('projectId', '==', projectId).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    const docRef = snapshot.docs[0].ref;
    const project = toProject(snapshot.docs[0]);

    if (!project) {
        return null;
    }

    // Find the API key
    const apiKeyIndex = project.apiKeys?.findIndex(ak => ak.id === apiKeyId);
    if (apiKeyIndex === undefined || apiKeyIndex === -1) {
        return null;
    }

    // Create updated API key
    const updatedApiKeys = [...(project.apiKeys || [])];
    const existingApiKey = updatedApiKeys[apiKeyIndex];

    updatedApiKeys[apiKeyIndex] = {
        ...existingApiKey,
        constraints: updateData.constraints,
    };

    // Update the project
    await docRef.update({
        apiKeys: updatedApiKeys,
        updatedAt: new Date(),
    });

    // Invalidate cache for both the project and the API key
    await deleteCache(`project:${projectId}`);
    const cacheKey = `project:api-key:${existingApiKey.key}`;
    await deleteCache(cacheKey);

    return updatedApiKeys[apiKeyIndex];
}

/**
 * Remove a user from a project
 * @param projectId - The unique projectId identifier
 * @param userId - Document ID of the user to remove
 * @returns Updated project document or null if project or user not found
 */
export async function removeUserFromProject(
    projectId: string,
    userId: string
): Promise<Project | null> {
    const collection = getProjectsCollection();

    // Find the project
    const snapshot = await collection.where('projectId', '==', projectId).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    const docRef = snapshot.docs[0].ref;
    const project = toProject(snapshot.docs[0]);

    if (!project) {
        return null;
    }

    // Check if user exists in the project
    const userExists = project.users.some(u => u.id === userId);
    if (!userExists) {
        return null;
    }

    // Remove the user
    const updatedUsers = project.users.filter(u => u.id !== userId);

    await docRef.update({
        users: updatedUsers,
        updatedAt: new Date(),
    });

    // Invalidate cache after update
    await deleteCache(`project:${projectId}`);

    const updatedDoc = await docRef.get();
    return toProject(updatedDoc);
}

/**
 * Find an alarm with matching core fields (message, environment, logType, level)
 * @param existingAlarms - Array of existing alarms
 * @param newAlarm - New alarm to check
 * @returns The matching alarm if found, undefined otherwise
 */
function findMatchingAlarm(existingAlarms: ProjectAlarm[], newAlarm: CreateAlarmInput): ProjectAlarm | undefined {
    return existingAlarms.find(existing => {
        // Compare levels (handle both string and array)
        const levelsMatch = (() => {
            const existingLevel = existing.level;
            const newLevel = newAlarm.level;

            // Both arrays
            if (Array.isArray(existingLevel) && Array.isArray(newLevel)) {
                return existingLevel.length === newLevel.length &&
                    existingLevel.every(l => newLevel.includes(l));
            }

            // Both strings
            if (typeof existingLevel === 'string' && typeof newLevel === 'string') {
                return existingLevel.toLowerCase() === newLevel.toLowerCase();
            }

            // Different types
            return false;
        })();

        // Compare messages (handle null which means "match any message")
        const messagesMatch = (() => {
            // Both null
            if (!existing.message && !newAlarm.message) {
                return true;
            }

            // One null, one not
            if (!existing.message || !newAlarm.message) {
                return false;
            }

            // Both strings
            return String(existing.message).toLowerCase() === String(existing.message).toLowerCase();
        })();

        return messagesMatch &&
            existing.environment.toLowerCase() === newAlarm.environment.toLowerCase() &&
            existing.logType.toLowerCase() === newAlarm.logType.toLowerCase() &&
            levelsMatch;
    });
}

/**
 * Add an alarm to a project, or update delivery methods if matching alarm exists
 * @param projectId - The unique projectId identifier
 * @param alarmData - Alarm data to add
 * @returns { added: boolean, updated: boolean, project: Project | null } - Result of the operation
 */
export async function addAlarmToProject(
    projectId: string,
    alarmData: CreateAlarmInput
): Promise<{ added: boolean; updated: boolean; project: Project | null }> {
    const collection = getProjectsCollection();

    // Find the project
    const snapshot = await collection.where('projectId', '==', projectId).limit(1).get();

    if (snapshot.empty) {
        return { added: false, updated: false, project: null };
    }

    const docRef = snapshot.docs[0].ref;
    const project = toProject(snapshot.docs[0]);

    if (!project) {
        return { added: false, updated: false, project: null };
    }

    // Check if an alarm with matching core fields exists
    const existingAlarms = project.alarms || [];
    const matchingAlarm = findMatchingAlarm(existingAlarms, alarmData);

    if (matchingAlarm) {
        // Update the delivery methods of the existing alarm
        const updatedAlarms = existingAlarms.map(alarm => {
            if (alarm.id === matchingAlarm.id) {
                return {
                    ...alarm,
                    deliveryMethods: alarmData.deliveryMethods,
                };
            }
            return alarm;
        });

        await docRef.update({
            alarms: updatedAlarms,
            updatedAt: new Date(),
        });

        // Invalidate cache after update
        await deleteCache(`project:${projectId}`);

        const updatedDoc = await docRef.get();
        return { added: false, updated: true, project: toProject(updatedDoc) };
    }

    // Create the alarm object with a unique ID
    const newAlarm: ProjectAlarm = {
        id: randomUUID(),
        logType: alarmData.logType,
        message: alarmData.message?.trim(),
        level: alarmData.level,
        environment: alarmData.environment.trim(),
        deliveryMethods: alarmData.deliveryMethods,
    };

    // Add the alarm to the project
    await docRef.update({
        alarms: arrayUnion(newAlarm),
        updatedAt: new Date(),
    });

    // Invalidate cache after update
    await deleteCache(`project:${projectId}`);

    const updatedDoc = await docRef.get();
    return { added: true, updated: false, project: toProject(updatedDoc) };
}

/**
 * Get all alarms for a project
 * @param projectId - The unique projectId identifier
 * @returns Array of alarms or null if project not found
 */
export async function getProjectAlarms(projectId: string): Promise<ProjectAlarm[] | null> {
    const project = await findProjectByProjectId(projectId);
    if (!project) {
        return null;
    }
    return project.alarms || [];
}

/**
 * Update an alarm by its ID
 * @param projectId - The unique projectId identifier
 * @param alarmId - The alarm ID to update
 * @param alarmData - Updated alarm data
 * @returns Updated alarm or null if not found
 */
export async function updateAlarmById(
    projectId: string,
    alarmId: string,
    alarmData: CreateAlarmInput
): Promise<ProjectAlarm | null> {
    const collection = getProjectsCollection();

    // Find the project
    const snapshot = await collection.where('projectId', '==', projectId).limit(1).get();

    if (snapshot.empty) {
        return null;
    }

    const docRef = snapshot.docs[0].ref;
    const project = toProject(snapshot.docs[0]);

    if (!project) {
        return null;
    }

    // Find the alarm to update
    const alarmIndex = project.alarms?.findIndex(alarm => alarm.id === alarmId);
    if (alarmIndex === undefined || alarmIndex === -1) {
        return null;
    }

    // Update the alarm with new data (keep the same ID)
    const updatedAlarms = [...(project.alarms || [])];
    updatedAlarms[alarmIndex] = {
        id: alarmId, // Keep the original ID
        logType: alarmData.logType,
        message: alarmData.message?.trim(),
        level: alarmData.level,
        environment: alarmData.environment.trim(),
        deliveryMethods: alarmData.deliveryMethods,
    };

    // Update the project
    await docRef.update({
        alarms: updatedAlarms,
        updatedAt: new Date(),
    });

    // Invalidate cache after update
    await deleteCache(`project:${projectId}`);

    return updatedAlarms[alarmIndex];
}

/**
 * Delete an alarm from a project by alarm ID, or delete all alarms if no ID provided
 * @param projectId - The unique projectId identifier
 * @param alarmId - Optional alarm ID to delete. If not provided, all alarms are deleted
 * @returns true if alarm(s) were deleted, false if project not found or alarm ID not found
 */
export async function deleteProjectAlarm(projectId: string, alarmId?: string): Promise<boolean> {
    const collection = getProjectsCollection();

    // Find the project
    const snapshot = await collection.where('projectId', '==', projectId).limit(1).get();

    if (snapshot.empty) {
        return false;
    }

    const docRef = snapshot.docs[0].ref;
    const project = toProject(snapshot.docs[0]);

    if (!project) {
        return false;
    }

    if (alarmId) {
        // Delete specific alarm by ID
        const alarmToRemove = project.alarms?.find(alarm => alarm.id === alarmId);
        if (!alarmToRemove) {
            return false;
        }

        // Remove from alarms array
        await docRef.update({
            alarms: arrayRemove(alarmToRemove),
            updatedAt: new Date(),
        });
    } else {
        // Delete all alarms
        await docRef.update({
            alarms: [],
            updatedAt: new Date(),
        });
    }

    // Invalidate cache after update
    await deleteCache(`project:${projectId}`);

    return true;
}
