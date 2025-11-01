"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProjectIndexes = createProjectIndexes;
exports.generateUniqueProjectId = generateUniqueProjectId;
exports.createProject = createProject;
exports.findProjectByProjectId = findProjectByProjectId;
exports.findProjectById = findProjectById;
exports.getProjectsByUserId = getProjectsByUserId;
exports.getAllProjects = getAllProjects;
exports.updateProject = updateProject;
exports.deleteProject = deleteProject;
exports.projectIdExists = projectIdExists;
exports.removeUserFromAllProjects = removeUserFromAllProjects;
exports.createProjectApiKey = createProjectApiKey;
exports.getProjectApiKeys = getProjectApiKeys;
exports.deleteProjectApiKey = deleteProjectApiKey;
exports.findProjectByApiKey = findProjectByApiKey;
exports.updateUserRoleOnProject = updateUserRoleOnProject;
const crypto_1 = require("crypto");
const firestore_connection_1 = require("../database/firestore.connection");
const slugify_util_1 = require("../utils/slugify.util");
const redis_service_1 = require("./redis.service");
const COLLECTION_NAME = 'projects';
/**
 * Get the projects collection
 */
function getProjectsCollection() {
    const db = (0, firestore_connection_1.getFirestore)();
    if (!db) {
        throw new Error('Firestore not connected');
    }
    return db.collection(COLLECTION_NAME);
}
/**
 * Convert Firestore document to Project type
 */
function toProject(doc) {
    if (!doc.exists)
        return null;
    const data = doc.data();
    return {
        ...data,
        _id: doc.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        apiKeys: data.apiKeys?.map((key) => ({
            ...key,
            createdAt: key.createdAt?.toDate() || new Date(),
        })) || [],
    };
}
/**
 * Create indexes for the projects collection
 * Firestore creates indexes automatically, but we can create composite indexes if needed
 * For now, single-field indexes are auto-created
 */
async function createProjectIndexes() {
    // Firestore auto-creates single-field indexes
    // Composite indexes would be defined in firestore.indexes.json if needed
    console.log('✅ Firestore auto-creates indexes for projects collection');
}
/**
 * Generate a unique projectId from a name
 * @param name - Project's name
 * @returns Unique projectId
 */
async function generateUniqueProjectId(name) {
    const baseSlug = (0, slugify_util_1.slugify)(name);
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
async function createProject(projectData, creatorUserId) {
    const collection = getProjectsCollection();
    // Generate unique projectId from name
    const projectId = await generateUniqueProjectId(projectData.name);
    // Create project user with creator as admin
    const creatorUser = {
        id: creatorUserId,
        role: 'admin',
    };
    const now = new Date();
    const project = {
        name: projectData.name,
        description: projectData.description,
        projectId,
        users: [creatorUser],
        createdAt: now,
        updatedAt: now,
    };
    const docRef = await collection.add(project);
    const doc = await docRef.get();
    return toProject(doc);
}
/**
 * Find a project by projectId
 * @param projectId - The unique projectId identifier
 * @returns Project document or null
 */
async function findProjectByProjectId(projectId) {
    const collection = getProjectsCollection();
    const snapshot = await collection.where('projectId', '==', projectId).limit(1).get();
    if (snapshot.empty) {
        return null;
    }
    return toProject(snapshot.docs[0]);
}
/**
 * Find a project by Firestore document _id
 * @param id - Firestore document ID string
 * @returns Project document or null
 */
async function findProjectById(id) {
    const collection = getProjectsCollection();
    const doc = await collection.doc(id).get();
    return toProject(doc);
}
/**
 * Get all projects for a specific user
 * @param userId - Document ID of the user
 * @returns Array of project documents
 */
async function getProjectsByUserId(userId) {
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
    const uniqueDocs = allDocs.filter((doc, index, self) => index === self.findIndex((d) => d.id === doc.id));
    const projects = uniqueDocs.map(doc => toProject(doc)).filter(Boolean);
    return projects;
}
/**
 * Get all projects (with pagination)
 * @param limit - Maximum number of projects to return
 * @param skip - Number of projects to skip
 * @returns Array of project documents
 */
async function getAllProjects(limit = 100, skip = 0) {
    const collection = getProjectsCollection();
    let query = collection.orderBy('createdAt', 'desc').limit(limit);
    // Firestore doesn't have skip, but we can use offset
    if (skip > 0) {
        query = query.offset(skip);
    }
    const snapshot = await query.get();
    return snapshot.docs.map(doc => toProject(doc)).filter(Boolean);
}
/**
 * Update a project by projectId
 * @param projectId - The unique projectId identifier
 * @param updateData - Fields to update
 * @returns Updated project document or null
 */
async function updateProject(projectId, updateData) {
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
    const updatedDoc = await docRef.get();
    return toProject(updatedDoc);
}
/**
 * Delete a project by projectId
 * @param projectId - The unique projectId identifier
 * @returns true if project was deleted, false otherwise
 */
async function deleteProject(projectId) {
    const collection = getProjectsCollection();
    const snapshot = await collection.where('projectId', '==', projectId).limit(1).get();
    if (snapshot.empty) {
        return false;
    }
    await snapshot.docs[0].ref.delete();
    return true;
}
/**
 * Check if a projectId already exists
 * @param projectId - The projectId to check
 * @returns true if projectId exists, false otherwise
 */
async function projectIdExists(projectId) {
    const project = await findProjectByProjectId(projectId);
    return project !== null;
}
/**
 * Remove a user from all projects
 * Called when a user is deleted
 * @param userId - Document ID of the user to remove
 */
async function removeUserFromAllProjects(userId) {
    const collection = getProjectsCollection();
    // Get all projects
    const snapshot = await collection.get();
    // Update each project that has this user
    const batch = (0, firestore_connection_1.getFirestore)().batch();
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
function generateApiKey(length = 40) {
    let apiKey = '';
    while (apiKey.length < length) {
        const bytes = (0, crypto_1.randomBytes)(32);
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
async function createProjectApiKey(projectId) {
    const collection = getProjectsCollection();
    // Find the project
    const snapshot = await collection.where('projectId', '==', projectId).limit(1).get();
    if (snapshot.empty) {
        return null;
    }
    const docRef = snapshot.docs[0].ref;
    const apiKeyString = generateApiKey();
    const apiKeyId = (0, crypto_1.randomUUID)();
    const now = new Date();
    const newApiKey = {
        id: apiKeyId,
        key: apiKeyString,
        createdAt: now,
        constraints: {},
    };
    // Add to apiKeys array
    await docRef.update({
        apiKeys: (0, firestore_connection_1.arrayUnion)(newApiKey),
        updatedAt: now,
    });
    return newApiKey;
}
/**
 * Get all API keys for a project
 * @param projectId - The unique projectId identifier
 * @returns Array of API keys or null if project not found
 */
async function getProjectApiKeys(projectId) {
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
async function deleteProjectApiKey(projectId, apiKeyId) {
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
        apiKeys: (0, firestore_connection_1.arrayRemove)(apiKeyToRemove),
        updatedAt: new Date(),
    });
    return true;
}
/**
 * Find a project by API key
 * Used for API key authentication
 * @param apiKey - The API key string to search for
 * @returns Project document or null
 */
async function findProjectByApiKey(apiKey) {
    const cacheKey = `project:api-key:${apiKey}`;
    const cachedProject = await (0, redis_service_1.getCache)(cacheKey);
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
            await (0, redis_service_1.setCache)(cacheKey, project, 300); // 5-minute cache
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
async function updateUserRoleOnProject(projectId, userId, newRole) {
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
    const updatedDoc = await docRef.get();
    return toProject(updatedDoc);
}
