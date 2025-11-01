import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../helpers/test-app.helper';
import { createTestToken, createAuthHeader } from '../helpers/auth.helper';
import { createTestUser, createTestProject } from '../helpers/db.helper';
import { getFirestore } from '../../database/firestore.connection';
import { getTypesenseClient } from '../../services/typesense.service';

const app = createTestApp();

describe('POST /api/v1/logs/:projectId/search - Advanced Message Filtering', () => {
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

        testUserToken = createTestToken(testUser.userId, testUser.email);

        // Create test project
        if (!testUser._id) {
            throw new Error('Test user _id is required');
        }
        testProject = await createTestProject(
            {
                name: `Test Project ${timestamp} ${randomSuffix}`,
                description: 'A test project',
            },
            testUser._id
        );

        // Create another user for access control tests
        otherUser = await createTestUser({
            name: `Other User ${timestamp} ${randomSuffix}`,
            email: `other-${timestamp}-${randomSuffix}@example.com`,
            password: 'password123',
        });

        otherUserToken = createTestToken(otherUser.userId, otherUser.email);

        // Create another project for the other user
        if (!otherUser._id) {
            throw new Error('Other user _id is required');
        }
        otherProject = await createTestProject(
            {
                name: `Other Project ${timestamp} ${randomSuffix}`,
                description: 'Another test project',
            },
            otherUser._id
        );

        // Create test logs
        const db = getFirestore();
        if (!db) {
            throw new Error('Database not connected');
        }

        const logsCollection = db.collection('logs');
        const projectObjectId = testProject._id;

        const logsToInsert = [
            {
                level: 'error',
                environment: 'production',
                projectId: testProject.projectId,
                projectObjectId,
                message: 'Database connection timeout',
                stackTrace: [],
                details: {},
                timestampMS: Date.now() - 1000,
                createdAt: new Date(),
            },
            {
                level: 'error',
                environment: 'production',
                projectId: testProject.projectId,
                projectObjectId,
                message: 'Failed to connect to database',
                stackTrace: [],
                details: {},
                timestampMS: Date.now() - 2000,
                createdAt: new Date(),
            },
            {
                level: 'warn',
                environment: 'production',
                projectId: testProject.projectId,
                projectObjectId,
                message: 'Connection slow - retrying',
                stackTrace: [],
                details: {},
                timestampMS: Date.now() - 3000,
                createdAt: new Date(),
            },
            {
                level: 'info',
                environment: 'staging',
                projectId: testProject.projectId,
                projectObjectId,
                message: 'User login successful',
                stackTrace: [],
                details: {},
                timestampMS: Date.now() - 4000,
                createdAt: new Date(),
            },
            {
                level: 'error',
                environment: 'production',
                projectId: testProject.projectId,
                projectObjectId,
                message: 'Request timeout occurred',
                stackTrace: [],
                details: {},
                timestampMS: Date.now() - 5000,
                createdAt: new Date(),
            },
        ];

        // Insert logs into Firestore
        for (const log of logsToInsert) {
            await logsCollection.add(log);
        }

        // Index logs in Typesense
        const typesenseClient = getTypesenseClient();
        for (const log of logsToInsert) {
            try {
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
                if (error && typeof error === 'object' && 'httpStatus' in error && error.httpStatus !== 409) {
                    throw error;
                }
            }
        }

        // Wait for Typesense to index
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    it('should search logs without any filters', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
            })
            .expect(200);

        expect(response.body).toHaveProperty('logs');
        expect(response.body).toHaveProperty('pagination');
        expect(Array.isArray(response.body.logs)).toBe(true);
        expect(response.body.logs.length).toBeGreaterThan(0);
    });

    it('should filter logs by level', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
                level: 'error',
            })
            .expect(200);

        expect(response.body.logs.length).toBeGreaterThan(0);
        response.body.logs.forEach((log: any) => {
            expect(log.level).toBe('error');
        });
    });

    it('should filter logs with "contains" match type', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
                messageFilter: {
                    operator: 'OR',
                    conditions: [
                        {
                            phrase: 'timeout',
                            matchType: 'contains',
                        },
                    ],
                },
            })
            .expect(200);

        expect(response.body.logs.length).toBeGreaterThan(0);
        response.body.logs.forEach((log: any) => {
            expect(log.message.toLowerCase()).toContain('timeout');
        });
    });

    it('should filter logs with "startsWith" match type', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
                messageFilter: {
                    operator: 'OR',
                    conditions: [
                        {
                            phrase: 'Failed',
                            matchType: 'startsWith',
                        },
                    ],
                },
            })
            .expect(200);

        expect(response.body.logs.length).toBeGreaterThan(0);
        response.body.logs.forEach((log: any) => {
            expect(log.message.toLowerCase()).toMatch(/^failed/i);
        });
    });

    it('should filter logs with "endsWith" match type', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
                messageFilter: {
                    operator: 'OR',
                    conditions: [
                        {
                            phrase: 'successful',
                            matchType: 'endsWith',
                        },
                    ],
                },
            })
            .expect(200);

        expect(response.body.logs.length).toBeGreaterThan(0);
        response.body.logs.forEach((log: any) => {
            expect(log.message.toLowerCase()).toMatch(/successful$/i);
        });
    });

    it('should filter logs with AND operator (multiple conditions)', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
                messageFilter: {
                    operator: 'AND',
                    conditions: [
                        {
                            phrase: 'database',
                            matchType: 'contains',
                        },
                        {
                            phrase: 'timeout',
                            matchType: 'contains',
                        },
                    ],
                },
            })
            .expect(200);

        expect(response.body.logs.length).toBeGreaterThan(0);
        response.body.logs.forEach((log: any) => {
            expect(log.message.toLowerCase()).toContain('database');
            expect(log.message.toLowerCase()).toContain('timeout');
        });
    });

    it('should filter logs with OR operator (multiple conditions)', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
                messageFilter: {
                    operator: 'OR',
                    conditions: [
                        {
                            phrase: 'database',
                            matchType: 'contains',
                        },
                        {
                            phrase: 'Connection',
                            matchType: 'startsWith',
                        },
                    ],
                },
            })
            .expect(200);

        expect(response.body.logs.length).toBeGreaterThan(0);
        response.body.logs.forEach((log: any) => {
            const hasDatabase = log.message.toLowerCase().includes('database');
            const startsWithConnection = log.message.toLowerCase().startsWith('connection');
            expect(hasDatabase || startsWithConnection).toBe(true);
        });
    });

    it('should combine level filter with message filter', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
                level: 'error',
                messageFilter: {
                    operator: 'OR',
                    conditions: [
                        {
                            phrase: 'timeout',
                            matchType: 'contains',
                        },
                    ],
                },
            })
            .expect(200);

        expect(response.body.logs.length).toBeGreaterThan(0);
        response.body.logs.forEach((log: any) => {
            expect(log.level).toBe('error');
            expect(log.message.toLowerCase()).toContain('timeout');
        });
    });

    it('should return 400 with invalid operator', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
                messageFilter: {
                    operator: 'INVALID',
                    conditions: [
                        {
                            phrase: 'test',
                            matchType: 'contains',
                        },
                    ],
                },
            })
            .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('operator must be either "AND" or "OR"');
    });

    it('should return 400 with invalid matchType', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
                messageFilter: {
                    operator: 'AND',
                    conditions: [
                        {
                            phrase: 'test',
                            matchType: 'invalid',
                        },
                    ],
                },
            })
            .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('matchType');
    });

    it('should return 400 with empty conditions array', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
                messageFilter: {
                    operator: 'AND',
                    conditions: [],
                },
            })
            .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('non-empty array');
    });

    it('should return 401 without authentication', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .send({
                page: 1,
                pageSize: 50,
            })
            .expect(401);

        expect(response.body).toHaveProperty('error');
    });

    it('should return 403 when user does not have access to project', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${otherProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
            })
            .expect(403);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('do not have access');
    });

    it('should return 404 when project does not exist', async () => {
        const response = await request(app)
            .post('/api/v1/logs/non-existent-project/search')
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
            })
            .expect(404);

        expect(response.body).toHaveProperty('error', 'Project not found');
    });

    it('should handle pagination correctly', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 2,
            })
            .expect(200);

        expect(response.body.pagination.page).toBe(1);
        expect(response.body.pagination.pageSize).toBe(2);
        expect(response.body.logs.length).toBeLessThanOrEqual(2);
    });
});

