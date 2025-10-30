import request from 'supertest';
import { ObjectId } from 'mongodb';
import { randomUUID } from 'crypto';
import { createTestApp } from '../helpers/test-app.helper';
import { createTestToken, createAuthHeader } from '../helpers/auth.helper';
import { createTestUser, createTestProject } from '../helpers/db.helper';
import { getDatabase } from '../../database/connection';
import { getTypesenseClient } from '../../services/typesense.service';

const app = createTestApp();

describe('Log Endpoints Integration Tests', () => {
    let testUser: any;
    let testProject: any;
    let testUserToken: string;
    let otherUser: any;
    let otherUserToken: string;
    let otherProject: any;

    beforeEach(async () => {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);

        // Create test user
        testUser = await createTestUser({
            name: `Test User ${timestamp} ${randomSuffix}`,
            email: `test-${timestamp}-${randomSuffix}@example.com`,
            password: 'password123',
        });

        // Create token for test user
        testUserToken = createTestToken(testUser.userId, testUser.email);

        // Create test project with test user as admin
        const userObjectId = typeof testUser._id === 'string' ? new ObjectId(testUser._id) : testUser._id;
        testProject = await createTestProject(
            {
                name: `Test Project ${timestamp} ${randomSuffix}`,
                description: 'A test project',
            },
            userObjectId
        );

        // Create another user for access control tests
        otherUser = await createTestUser({
            name: `Other User ${timestamp} ${randomSuffix}`,
            email: `other-${timestamp}-${randomSuffix}@example.com`,
            password: 'password123',
        });

        otherUserToken = createTestToken(otherUser.userId, otherUser.email);

        // Create another project for the other user
        const otherUserObjectId = typeof otherUser._id === 'string' ? new ObjectId(otherUser._id) : otherUser._id;
        otherProject = await createTestProject(
            {
                name: `Other Project ${timestamp} ${randomSuffix}`,
                description: 'Another test project',
            },
            otherUserObjectId
        );
    });

    describe('POST /api/v1/logs', () => {
        it('should successfully create log with valid data', async () => {
            const logData = {
                level: 'error',
                environment: 'production',
                projectId: testProject.projectId,
                message: 'Test error message',
                timestampMS: Date.now(),
            };

            const response = await request(app)
                .post('/api/v1/logs')
                .set('Authorization', createAuthHeader(testUserToken))
                .send(logData)
                .expect(201);

            expect(response.body).toHaveProperty('message', 'Log created successfully');
            expect(response.body).toHaveProperty('log');
            expect(response.body.log).toHaveProperty('level', logData.level);
            expect(response.body.log).toHaveProperty('environment', logData.environment);
            expect(response.body.log).toHaveProperty('projectId', logData.projectId);
            expect(response.body.log).toHaveProperty('message', logData.message);
            expect(response.body.log).toHaveProperty('timestampMS', logData.timestampMS);
        });

        it('should return 401 without authentication', async () => {
            const logData = {
                level: 'error',
                environment: 'production',
                projectId: testProject.projectId,
                message: 'Test error message',
                timestampMS: Date.now(),
            };

            const response = await request(app)
                .post('/api/v1/logs')
                .send(logData)
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

        it('should return 400 with missing required fields', async () => {
            const logData = {
                level: 'error',
                // Missing environment, projectId, message, timestampMS
            };

            const response = await request(app)
                .post('/api/v1/logs')
                .set('Authorization', createAuthHeader(testUserToken))
                .send(logData)
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Missing required fields');
        });

        it('should return 404 when project does not exist', async () => {
            const logData = {
                level: 'error',
                environment: 'production',
                projectId: new ObjectId().toString(), // Non-existent project ID
                message: 'Test error message',
                timestampMS: Date.now(),
            };

            const response = await request(app)
                .post('/api/v1/logs')
                .set('Authorization', createAuthHeader(testUserToken))
                .send(logData)
                .expect(404);

            expect(response.body).toHaveProperty('error', 'Project not found');
        });

        it('should return 403 when user does not have project access', async () => {
            const logData = {
                level: 'error',
                environment: 'production',
                projectId: otherProject.projectId, // Project owned by other user
                message: 'Test error message',
                timestampMS: Date.now(),
            };

            const response = await request(app)
                .post('/api/v1/logs')
                .set('Authorization', createAuthHeader(testUserToken))
                .send(logData)
                .expect(403);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('do not have access');
        });

        it('should successfully create log with optional fields (stackTrace, details)', async () => {
            const logData = {
                level: 'error',
                environment: 'production',
                projectId: testProject.projectId,
                message: 'Test error message',
                timestampMS: Date.now(),
                stackTrace: [
                    { file: 'app.js', line: 42, function: 'handleRequest' },
                ],
                details: {
                    userId: '123',
                    action: 'update',
                },
            };

            const response = await request(app)
                .post('/api/v1/logs')
                .set('Authorization', createAuthHeader(testUserToken))
                .send(logData)
                .expect(201);

            expect(response.body.log).toHaveProperty('stackTrace');
            expect(response.body.log.stackTrace).toEqual(logData.stackTrace);
            expect(response.body.log).toHaveProperty('details');
            expect(response.body.log.details).toEqual(logData.details);
        });
    });

    describe('GET /api/v1/logs/:projectId', () => {
        beforeEach(async () => {
            // Create some test logs
            const db = getDatabase();
            if (!db) {
                throw new Error('Database not connected');
            }

            const logsCollection = db.collection('logs');
            const projectObjectId = typeof testProject._id === 'string' ? new ObjectId(testProject._id) : testProject._id;

            // Insert logs directly into MongoDB
            await logsCollection.insertMany([
                {
                    level: 'error',
                    environment: 'production',
                    projectId: testProject.projectId,
                    projectObjectId,
                    message: 'Error log 1',
                    stackTrace: [],
                    details: {},
                    timestampMS: Date.now() - 1000,
                    createdAt: new Date(),
                },
                {
                    level: 'info',
                    environment: 'staging',
                    projectId: testProject.projectId,
                    projectObjectId,
                    message: 'Info log 1',
                    stackTrace: [],
                    details: {},
                    timestampMS: Date.now() - 2000,
                    createdAt: new Date(),
                },
                {
                    level: 'error',
                    environment: 'production',
                    projectId: testProject.projectId,
                    projectObjectId,
                    message: 'Error log 2',
                    stackTrace: [],
                    details: {},
                    timestampMS: Date.now() - 3000,
                    createdAt: new Date(),
                },
            ]);

            // Index logs in Typesense
            const typesenseClient = getTypesenseClient();
            const logs = await logsCollection.find({ projectId: testProject.projectId }).toArray();
            
            for (const log of logs) {
                try {
                    // Use UUID for Typesense document ID to match production behavior
                    await typesenseClient.collections('logs').documents().create({
                        id: randomUUID(),
                        level: log.level,
                        environment: log.environment,
                        projectId: log.projectId,
                        message: log.message,
                        stackTrace: log.stackTrace || [],
                        details: log.details || {},
                        timestampMS: log.timestampMS,
                        createdAt: log.createdAt.getTime(),
                    });
                } catch (error) {
                    // Ignore duplicate document errors
                    if (error && typeof error === 'object' && 'httpStatus' in error && error.httpStatus !== 409) {
                        throw error;
                    }
                }
            }

            // Wait a bit for Typesense to index
            await new Promise(resolve => setTimeout(resolve, 500));
        });

        it('should successfully retrieve logs with pagination', async () => {
            const response = await request(app)
                .get(`/api/v1/logs/${testProject.projectId}`)
                .set('Authorization', createAuthHeader(testUserToken))
                .expect(200);

            expect(response.body).toHaveProperty('logs');
            expect(response.body).toHaveProperty('pagination');
            expect(response.body.pagination).toHaveProperty('page', 1);
            expect(response.body.pagination).toHaveProperty('pageSize', 50);
            expect(response.body.pagination).toHaveProperty('total');
            expect(response.body.pagination).toHaveProperty('totalPages');
            expect(Array.isArray(response.body.logs)).toBe(true);
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app)
                .get(`/api/v1/logs/${testProject.projectId}`)
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

        it('should return 404 when project does not exist', async () => {
            const nonExistentProjectId = new ObjectId().toString();

            const response = await request(app)
                .get(`/api/v1/logs/${nonExistentProjectId}`)
                .set('Authorization', createAuthHeader(testUserToken))
                .expect(404);

            expect(response.body).toHaveProperty('error', 'Project not found');
        });

        it('should return 403 when user does not have project access', async () => {
            const response = await request(app)
                .get(`/api/v1/logs/${otherProject.projectId}`)
                .set('Authorization', createAuthHeader(testUserToken))
                .expect(403);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('do not have access');
        });

        it('should filter by level', async () => {
            const response = await request(app)
                .get(`/api/v1/logs/${testProject.projectId}`)
                .query({ level: 'error' })
                .set('Authorization', createAuthHeader(testUserToken))
                .expect(200);

            expect(response.body.logs.length).toBeGreaterThan(0);
            response.body.logs.forEach((log: any) => {
                expect(log.level).toBe('error');
            });
        });

        it('should filter by environment', async () => {
            const response = await request(app)
                .get(`/api/v1/logs/${testProject.projectId}`)
                .query({ environment: 'production' })
                .set('Authorization', createAuthHeader(testUserToken))
                .expect(200);

            expect(response.body.logs.length).toBeGreaterThan(0);
            response.body.logs.forEach((log: any) => {
                expect(log.environment).toBe('production');
            });
        });

        it('should search by message', async () => {
            const response = await request(app)
                .get(`/api/v1/logs/${testProject.projectId}`)
                .query({ message: 'Error' })
                .set('Authorization', createAuthHeader(testUserToken))
                .expect(200);

            expect(response.body.logs.length).toBeGreaterThan(0);
            response.body.logs.forEach((log: any) => {
                expect(log.message.toLowerCase()).toContain('error');
            });
        });

        it('should handle invalid pagination parameters', async () => {
            const response = await request(app)
                .get(`/api/v1/logs/${testProject.projectId}`)
                .query({ page: 0 })
                .set('Authorization', createAuthHeader(testUserToken))
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Page must be greater than 0');
        });

        it('should handle pageSize limits', async () => {
            const response = await request(app)
                .get(`/api/v1/logs/${testProject.projectId}`)
                .query({ pageSize: 1001 })
                .set('Authorization', createAuthHeader(testUserToken))
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Page size must be between 1 and 1000');
        });

        it('should handle pagination correctly', async () => {
            const page1Response = await request(app)
                .get(`/api/v1/logs/${testProject.projectId}`)
                .query({ page: 1, pageSize: 2 })
                .set('Authorization', createAuthHeader(testUserToken))
                .expect(200);

            expect(page1Response.body.pagination.page).toBe(1);
            expect(page1Response.body.pagination.pageSize).toBe(2);
            expect(page1Response.body.logs.length).toBeLessThanOrEqual(2);

            if (page1Response.body.pagination.totalPages > 1) {
                const page2Response = await request(app)
                    .get(`/api/v1/logs/${testProject.projectId}`)
                    .query({ page: 2, pageSize: 2 })
                    .set('Authorization', createAuthHeader(testUserToken))
                    .expect(200);

                expect(page2Response.body.pagination.page).toBe(2);
                expect(page2Response.body.logs.length).toBeGreaterThan(0);
            }
        });

        it('should handle empty results', async () => {
            // Create a new project with no logs
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(7);
            const userObjectId = typeof testUser._id === 'string' ? new ObjectId(testUser._id) : testUser._id;
            const emptyProject = await createTestProject(
                {
                    name: `Empty Project ${timestamp} ${randomSuffix}`,
                    description: 'A project with no logs',
                },
                userObjectId
            );

            const response = await request(app)
                .get(`/api/v1/logs/${emptyProject.projectId}`)
                .set('Authorization', createAuthHeader(testUserToken))
                .expect(200);

            expect(response.body.logs).toEqual([]);
            expect(response.body.pagination.total).toBe(0);
            expect(response.body.pagination.totalPages).toBe(0);
        });
    });
});

