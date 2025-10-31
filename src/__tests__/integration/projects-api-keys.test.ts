import request from 'supertest';
import { createTestApp } from '../helpers/test-app.helper';
import { createTestToken, createAuthHeader } from '../helpers/auth.helper';
import { createTestUser, createTestProject } from '../helpers/db.helper';
import { getFirestore } from '../../database/firestore.connection';
import { findProjectByProjectId } from '../../services/projects.service';
import { ProjectUser } from '../../types/project.types';

const app = createTestApp();

describe('Project API Keys Integration Tests', () => {
    let adminUser: any;
    let adminToken: string;
    let editorUser: any;
    let editorToken: string;
    let viewerUser: any;
    let viewerToken: string;
    let otherUser: any;
    let otherUserToken: string;
    let testProject: any;

    beforeEach(async () => {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);

        // Create admin user and project
        adminUser = await createTestUser({
            name: `Admin User ${timestamp} ${randomSuffix}`,
            email: `admin-${timestamp}-${randomSuffix}@example.com`,
            password: 'password123',
        });
        adminToken = createTestToken(adminUser.userId, adminUser.email);

        if (!adminUser._id) {
            throw new Error('Admin user _id is required');
        }
        testProject = await createTestProject(
            {
                name: `Test Project ${timestamp} ${randomSuffix}`,
                description: 'A test project',
            },
            adminUser._id
        );

        // Create editor user
        editorUser = await createTestUser({
            name: `Editor User ${timestamp} ${randomSuffix}`,
            email: `editor-${timestamp}-${randomSuffix}@example.com`,
            password: 'password123',
        });
        editorToken = createTestToken(editorUser.userId, editorUser.email);

        // Create viewer user
        viewerUser = await createTestUser({
            name: `Viewer User ${timestamp} ${randomSuffix}`,
            email: `viewer-${timestamp}-${randomSuffix}@example.com`,
            password: 'password123',
        });
        viewerToken = createTestToken(viewerUser.userId, viewerUser.email);

        // Create other user (not in project)
        otherUser = await createTestUser({
            name: `Other User ${timestamp} ${randomSuffix}`,
            email: `other-${timestamp}-${randomSuffix}@example.com`,
            password: 'password123',
        });
        otherUserToken = createTestToken(otherUser.userId, otherUser.email);

        // Add editor and viewer users to the project
        const db = getFirestore();
        if (!db) {
            throw new Error('Database not connected');
        }

        if (!editorUser._id || !viewerUser._id) {
            throw new Error('User _id is required');
        }

        const editorProjectUser: ProjectUser = {
            id: editorUser._id,
            role: 'editor',
        };

        const viewerProjectUser: ProjectUser = {
            id: viewerUser._id,
            role: 'viewer',
        };

        // Fetch the project, update users array, and save
        const projectsCollection = db.collection('projects');
        const projectSnapshot = await projectsCollection.where('projectId', '==', testProject.projectId).limit(1).get();
        
        if (!projectSnapshot.empty) {
            const projectDoc = projectSnapshot.docs[0];
            const project = projectDoc.data();
            const updatedUsers = [
                ...(project.users || []),
                editorProjectUser,
                viewerProjectUser,
            ];
            await projectDoc.ref.update({ users: updatedUsers });
        }
    });

    describe('POST /api/v1/projects/:projectId/api-keys', () => {
        it('should successfully create API key as admin', async () => {
            const response = await request(app)
                .post(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(adminToken))
                .expect(201);

            expect(response.body).toHaveProperty('message', 'API key created successfully');
            expect(response.body).toHaveProperty('apiKey');
            expect(response.body.apiKey).toHaveProperty('id');
            expect(response.body.apiKey).toHaveProperty('key');
            expect(response.body.apiKey).toHaveProperty('createdAt');
            expect(response.body.apiKey).toHaveProperty('constraints');
            expect(response.body.apiKey.constraints).toEqual({});
            expect(response.body.apiKey.key).toHaveLength(40);
        });

        it('should successfully create API key as editor', async () => {
            const response = await request(app)
                .post(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(editorToken))
                .expect(201);

            expect(response.body).toHaveProperty('message', 'API key created successfully');
            expect(response.body).toHaveProperty('apiKey');
            expect(response.body.apiKey).toHaveProperty('id');
            expect(response.body.apiKey).toHaveProperty('key');
            expect(response.body.apiKey.key).toHaveLength(40);
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app)
                .post(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .expect(401);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('token');
        });

        it('should return 404 when project does not exist', async () => {
            const nonExistentProjectId = 'non-existent-project-id';

            const response = await request(app)
                .post(`/api/v1/projects/${nonExistentProjectId}/api-keys`)
                .set('Authorization', createAuthHeader(adminToken))
                .expect(404);

            expect(response.body).toHaveProperty('error', 'Project not found');
        });

        it('should return 403 when user is viewer', async () => {
            const response = await request(app)
                .post(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(viewerToken))
                .expect(403);

            expect(response.body).toHaveProperty('error', 'Forbidden: Only admins and editors can create API keys');
        });

        it('should return 403 when user is not in project', async () => {
            const response = await request(app)
                .post(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(otherUserToken))
                .expect(403);

            expect(response.body).toHaveProperty('error', 'Forbidden: Only admins and editors can create API keys');
        });

        it('should create multiple API keys', async () => {
            const response1 = await request(app)
                .post(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(adminToken))
                .expect(201);

            const response2 = await request(app)
                .post(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(adminToken))
                .expect(201);

            expect(response1.body.apiKey.id).not.toBe(response2.body.apiKey.id);
            expect(response1.body.apiKey.key).not.toBe(response2.body.apiKey.key);
        });
    });

    describe('GET /api/v1/projects/:projectId/api-keys', () => {
        let createdApiKey1: any;
        let createdApiKey2: any;

        beforeEach(async () => {
            // Create some API keys for testing
            const response1 = await request(app)
                .post(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(adminToken));

            const response2 = await request(app)
                .post(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(adminToken));

            createdApiKey1 = response1.body.apiKey;
            createdApiKey2 = response2.body.apiKey;
        });

        it('should successfully retrieve API keys as admin', async () => {
            const response = await request(app)
                .get(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(adminToken))
                .expect(200);

            expect(response.body).toHaveProperty('apiKeys');
            expect(response.body).toHaveProperty('count');
            expect(Array.isArray(response.body.apiKeys)).toBe(true);
            expect(response.body.count).toBeGreaterThanOrEqual(2);
            expect(response.body.apiKeys.length).toBeGreaterThanOrEqual(2);

            // Verify API key structure
            const apiKey = response.body.apiKeys.find((ak: any) => ak.id === createdApiKey1.id);
            expect(apiKey).toBeDefined();
            expect(apiKey).toHaveProperty('id');
            expect(apiKey).toHaveProperty('key');
            expect(apiKey).toHaveProperty('createdAt');
            expect(apiKey).toHaveProperty('constraints');
        });

        it('should successfully retrieve API keys as editor', async () => {
            const response = await request(app)
                .get(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(editorToken))
                .expect(200);

            expect(response.body).toHaveProperty('apiKeys');
            expect(response.body).toHaveProperty('count');
            expect(response.body.count).toBeGreaterThanOrEqual(2);
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app)
                .get(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .expect(401);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('token');
        });

        it('should return 404 when project does not exist', async () => {
            const nonExistentProjectId = 'non-existent-project-id';

            const response = await request(app)
                .get(`/api/v1/projects/${nonExistentProjectId}/api-keys`)
                .set('Authorization', createAuthHeader(adminToken))
                .expect(404);

            expect(response.body).toHaveProperty('error', 'Project not found');
        });

        it('should return 403 when user is viewer', async () => {
            const response = await request(app)
                .get(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(viewerToken))
                .expect(403);

            expect(response.body).toHaveProperty('error', 'Forbidden: Only admins and editors can view API keys');
        });

        it('should return 403 when user is not in project', async () => {
            const response = await request(app)
                .get(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(otherUserToken))
                .expect(403);

            expect(response.body).toHaveProperty('error', 'Forbidden: Only admins and editors can view API keys');
        });

        it('should return empty array when no API keys exist', async () => {
            // Create a new project with no API keys
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(7);
            if (!adminUser._id) {
                throw new Error('Admin user _id is required');
            }
            const emptyProject = await createTestProject(
                {
                    name: `Empty Project ${timestamp} ${randomSuffix}`,
                    description: 'A project with no API keys',
                },
                adminUser._id
            );

            const response = await request(app)
                .get(`/api/v1/projects/${emptyProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(adminToken))
                .expect(200);

            expect(response.body.apiKeys).toEqual([]);
            expect(response.body.count).toBe(0);
        });
    });

    describe('DELETE /api/v1/projects/:projectId/api-keys/:apiKeyId', () => {
        let createdApiKey: any;

        beforeEach(async () => {
            // Create an API key for testing deletion
            const response = await request(app)
                .post(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(adminToken));

            createdApiKey = response.body.apiKey;
        });

        it('should successfully delete API key as admin', async () => {
            const response = await request(app)
                .delete(`/api/v1/projects/${testProject.projectId}/api-keys/${createdApiKey.id}`)
                .set('Authorization', createAuthHeader(adminToken))
                .expect(200);

            expect(response.body).toHaveProperty('message', 'API key deleted successfully');

            // Verify API key is deleted
            const project = await findProjectByProjectId(testProject.projectId);
            const apiKeyExists = project?.apiKeys?.some(ak => ak.id === createdApiKey.id);
            expect(apiKeyExists).toBe(false);
        });

        it('should successfully delete API key as editor', async () => {
            // Create an API key as admin first
            const createResponse = await request(app)
                .post(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(adminToken));

            const apiKeyToDelete = createResponse.body.apiKey;

            const response = await request(app)
                .delete(`/api/v1/projects/${testProject.projectId}/api-keys/${apiKeyToDelete.id}`)
                .set('Authorization', createAuthHeader(editorToken))
                .expect(200);

            expect(response.body).toHaveProperty('message', 'API key deleted successfully');
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app)
                .delete(`/api/v1/projects/${testProject.projectId}/api-keys/${createdApiKey.id}`)
                .expect(401);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('token');
        });

        it('should return 404 when project does not exist', async () => {
            const nonExistentProjectId = 'non-existent-project-id';

            const response = await request(app)
                .delete(`/api/v1/projects/${nonExistentProjectId}/api-keys/${createdApiKey.id}`)
                .set('Authorization', createAuthHeader(adminToken))
                .expect(404);

            expect(response.body).toHaveProperty('error', 'Project not found');
        });

        it('should return 404 when API key does not exist', async () => {
            const nonExistentApiKeyId = 'non-existent-api-key-id';

            const response = await request(app)
                .delete(`/api/v1/projects/${testProject.projectId}/api-keys/${nonExistentApiKeyId}`)
                .set('Authorization', createAuthHeader(adminToken))
                .expect(404);

            expect(response.body).toHaveProperty('error', 'API key not found');
        });

        it('should return 403 when user is viewer', async () => {
            const response = await request(app)
                .delete(`/api/v1/projects/${testProject.projectId}/api-keys/${createdApiKey.id}`)
                .set('Authorization', createAuthHeader(viewerToken))
                .expect(403);

            expect(response.body).toHaveProperty('error', 'Forbidden: Only admins and editors can delete API keys');
        });

        it('should return 403 when user is not in project', async () => {
            const response = await request(app)
                .delete(`/api/v1/projects/${testProject.projectId}/api-keys/${createdApiKey.id}`)
                .set('Authorization', createAuthHeader(otherUserToken))
                .expect(403);

            expect(response.body).toHaveProperty('error', 'Forbidden: Only admins and editors can delete API keys');
        });

        it('should allow deleting multiple API keys', async () => {
            // Create two API keys
            const response1 = await request(app)
                .post(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(adminToken));

            const response2 = await request(app)
                .post(`/api/v1/projects/${testProject.projectId}/api-keys`)
                .set('Authorization', createAuthHeader(adminToken));

            const apiKey1 = response1.body.apiKey;
            const apiKey2 = response2.body.apiKey;

            // Delete first API key
            await request(app)
                .delete(`/api/v1/projects/${testProject.projectId}/api-keys/${apiKey1.id}`)
                .set('Authorization', createAuthHeader(adminToken))
                .expect(200);

            // Delete second API key
            await request(app)
                .delete(`/api/v1/projects/${testProject.projectId}/api-keys/${apiKey2.id}`)
                .set('Authorization', createAuthHeader(adminToken))
                .expect(200);

            // Verify both are deleted
            const project = await findProjectByProjectId(testProject.projectId);
            const apiKey1Exists = project?.apiKeys?.some(ak => ak.id === apiKey1.id);
            const apiKey2Exists = project?.apiKeys?.some(ak => ak.id === apiKey2.id);
            expect(apiKey1Exists).toBe(false);
            expect(apiKey2Exists).toBe(false);
        });
    });
});

