import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../helpers/test-app.helper';
import { createTestToken, createAuthHeader } from '../helpers/auth.helper';
import { createTestUser, createTestProject } from '../helpers/db.helper';
import { getFirestore } from '../../database/firestore.connection';
import { getTypesenseClient } from '../../services/typesense.service';

const app = createTestApp();

describe('POST /api/v1/logs/:projectId/search - Message filter AND contains + startsWith', () => {
    let testUser: any;
    let testProject: any;
    let testUserToken: string;

    beforeEach(async () => {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);

        testUser = await createTestUser({
            name: `MsgFilter User ${timestamp} ${randomSuffix}`,
            email: `msgfilter-${timestamp}-${randomSuffix}@example.com`,
            password: 'password123',
        });

        testUserToken = createTestToken(testUser.userId, testUser.email);

        if (!testUser._id) {
            throw new Error('Test user _id is required');
        }

        testProject = await createTestProject(
            {
                name: `MsgFilter Project ${timestamp} ${randomSuffix}`,
                description: 'Project for message filter tests',
            },
            testUser._id
        );

        const db = getFirestore();
        if (!db) {
            throw new Error('Database not connected');
        }

        const logsCollection = db.collection('logs');
        const projectObjectId = testProject._id;

        const now = Date.now();
        const logsToInsert = [
            {
                level: 'DEBUG',
                environment: 'DEVELOPMENT',
                projectId: testProject.projectId,
                projectObjectId,
                message: 'a silent engine crashes', // should NOT match
                stackTrace: [],
                details: {},
                timestampMS: now - 1000,
                createdAt: new Date(),
            },
            {
                level: 'DEBUG',
                environment: 'DEVELOPMENT',
                projectId: testProject.projectId,
                projectObjectId,
                message: 'flower engine roars', // should match
                stackTrace: [],
                details: {},
                timestampMS: now - 900,
                createdAt: new Date(),
            },
            {
                level: 'INFO',
                environment: 'PRODUCTION',
                projectId: testProject.projectId,
                projectObjectId,
                message: 'flower engine hums', // different environment
                stackTrace: [],
                details: {},
                timestampMS: now - 800,
                createdAt: new Date(),
            },
        ];

        for (const log of logsToInsert) {
            await logsCollection.add(log);
        }

        const typesenseClient = getTypesenseClient();
        for (const log of logsToInsert) {
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
        }
    });

    it('enforces AND semantics for contains + startsWith on message with environment filter', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
                environment: 'DEVELOPMENT',
                message: {
                    operator: 'AND',
                    conditions: [
                        { phrase: 'engine', matchType: 'contains' },
                        { phrase: 'flower', matchType: 'startsWith' },
                    ],
                },
            })
            .expect(200);

        const { logs } = response.body;
        expect(Array.isArray(logs)).toBe(true);
        expect(logs.length).toBeGreaterThan(0);

        logs.forEach((log: any) => {
            expect(log.environment).toBe('DEVELOPMENT');
            const msg = String(log.message).toLowerCase();
            expect(msg.startsWith('flower')).toBe(true);
            expect(msg.includes('engine')).toBe(true);
        });
    });

    it('returns 0 results when AND conditions cannot be satisfied', async () => {
        const response = await request(app)
            .post(`/api/v1/logs/${testProject.projectId}/search`)
            .set('Authorization', createAuthHeader(testUserToken))
            .send({
                page: 1,
                pageSize: 50,
                environment: 'DEVELOPMENT',
                message: {
                    operator: 'AND',
                    conditions: [
                        { phrase: 'engine', matchType: 'contains' },
                        { phrase: 'pegasus', matchType: 'startsWith' },
                    ],
                },
            })
            .expect(200);

        const { logs, pagination } = response.body;
        expect(Array.isArray(logs)).toBe(true);
        expect(logs.length).toBe(0);
        if (pagination && typeof pagination.total === 'number') {
            expect(pagination.total).toBe(0);
        }
    });
});


