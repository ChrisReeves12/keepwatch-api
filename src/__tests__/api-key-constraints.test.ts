import request from 'supertest';
import express, { Express } from 'express';
import { authenticateApiKey } from '../middleware/api-key.middleware';
import { createLog } from '../controllers/logs.controller';
import * as ProjectsService from '../services/projects.service';
import * as UsersService from '../services/users.service';
import { Project, ProjectApiKey } from '../types/project.types';
import { User } from '../types/user.types';

let app: Express;
let testUser: User;
let testProject: Project;
let testApiKey: ProjectApiKey;

beforeAll(() => {
    app = express();
    app.use(express.json());
    app.post('/api/v1/logs', authenticateApiKey, createLog);
});

beforeEach(async () => {
    testUser = {
        _id: 'test-user-id',
        userId: 'test-user',
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashed-password',
        emailVerifiedAt: new Date(),
        is2FARequired: false,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    testProject = {
        _id: 'test-project-id',
        name: 'Test Project',
        projectId: 'test-project',
        ownerId: testUser._id!,
        ownerName: testUser.name,
        ownerEmail: testUser.email,
        users: [{ id: testUser._id!, role: 'admin' }],
        apiKeys: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    testApiKey = {
        id: 'test-api-key-id',
        key: 'test-api-key-12345',
        createdAt: new Date(),
        constraints: {},
    };

    testProject.apiKeys = [testApiKey];

    jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
        userCreatedAt: testUser.createdAt,
        subscriptionPlanId: 'test-plan-id',
        logLimit: 10000,
    });
});

describe('API Key Constraints Integration Tests', () => {
    describe('IP Restrictions', () => {
        it('should allow request from allowed IP address', async () => {
            testApiKey.constraints = {
                ipRestrictions: {
                    allowedIps: ['192.168.1.100'],
                },
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .set('X-Forwarded-For', '192.168.1.100')
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(202);
        });

        it('should reject request from non-allowed IP address', async () => {
            testApiKey.constraints = {
                ipRestrictions: {
                    allowedIps: ['192.168.1.100'],
                },
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .set('X-Forwarded-For', '10.0.0.1')
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(403);
            expect(response.body.error).toBe('API key constraint violation');
            expect(response.body.constraint).toBe('ipRestrictions');
        });

        it('should allow request from IP in CIDR range', async () => {
            testApiKey.constraints = {
                ipRestrictions: {
                    allowedIps: ['192.168.1.0/24'],
                },
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .set('X-Forwarded-For', '192.168.1.150')
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(202);
        });

        it('should reject request from IP outside CIDR range', async () => {
            testApiKey.constraints = {
                ipRestrictions: {
                    allowedIps: ['192.168.1.0/24'],
                },
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .set('X-Forwarded-For', '192.168.2.1')
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(403);
            expect(response.body.constraint).toBe('ipRestrictions');
        });
    });

    describe('Referer Restrictions', () => {
        it('should allow request with matching referer', async () => {
            testApiKey.constraints = {
                refererRestrictions: {
                    allowedReferers: ['https://example.com/*'],
                },
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .set('Referer', 'https://example.com/page')
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(202);
        });

        it('should reject request with non-matching referer', async () => {
            testApiKey.constraints = {
                refererRestrictions: {
                    allowedReferers: ['https://example.com/*'],
                },
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .set('Referer', 'https://malicious.com/page')
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(403);
            expect(response.body.constraint).toBe('refererRestrictions');
        });

        it('should reject request with missing referer when required', async () => {
            testApiKey.constraints = {
                refererRestrictions: {
                    allowedReferers: ['https://example.com/*'],
                },
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(403);
            expect(response.body.constraint).toBe('refererRestrictions');
        });
    });

    describe('Origin Restrictions', () => {
        it('should allow request with matching origin', async () => {
            testApiKey.constraints = {
                originRestrictions: {
                    allowedOrigins: ['https://app.example.com'],
                },
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .set('Origin', 'https://app.example.com')
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(202);
        });

        it('should reject request with non-matching origin', async () => {
            testApiKey.constraints = {
                originRestrictions: {
                    allowedOrigins: ['https://app.example.com'],
                },
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .set('Origin', 'https://malicious.com')
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(403);
            expect(response.body.constraint).toBe('originRestrictions');
        });

        it('should allow request with wildcard origin pattern', async () => {
            testApiKey.constraints = {
                originRestrictions: {
                    allowedOrigins: ['https://*.example.com'],
                },
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .set('Origin', 'https://subdomain.example.com')
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(202);
        });
    });

    describe('Environment Restrictions', () => {
        it('should allow request for allowed environment', async () => {
            testApiKey.constraints = {
                allowedEnvironments: ['production', 'staging'],
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(202);
        });

        it('should reject request for non-allowed environment', async () => {
            testApiKey.constraints = {
                allowedEnvironments: ['production', 'staging'],
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'development',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(403);
            expect(response.body.constraint).toBe('allowedEnvironments');
        });
    });

    describe('Expiration Date', () => {
        it('should allow request with non-expired API key', async () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 30);

            testApiKey.constraints = {
                expirationDate: futureDate,
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(202);
        });

        it('should reject request with expired API key', async () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);

            testApiKey.constraints = {
                expirationDate: pastDate,
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(403);
            expect(response.body.constraint).toBe('expirationDate');
        });
    });

    describe('User Agent Restrictions', () => {
        it('should allow request with matching user agent pattern', async () => {
            testApiKey.constraints = {
                userAgentRestrictions: {
                    allowedPatterns: ['^Mozilla/.*'],
                },
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(202);
        });

        it('should reject request with non-matching user agent', async () => {
            testApiKey.constraints = {
                userAgentRestrictions: {
                    allowedPatterns: ['^Mozilla/.*'],
                },
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .set('User-Agent', 'curl/7.68.0')
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(403);
            expect(response.body.constraint).toBe('userAgentRestrictions');
        });

        it('should reject request with missing user agent when required', async () => {
            testApiKey.constraints = {
                userAgentRestrictions: {
                    allowedPatterns: ['^Mozilla/.*'],
                },
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(403);
            expect(response.body.constraint).toBe('userAgentRestrictions');
        });
    });

    describe('Multiple Constraints', () => {
        it('should allow request when all constraints pass', async () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 30);

            testApiKey.constraints = {
                ipRestrictions: {
                    allowedIps: ['192.168.1.0/24'],
                },
                allowedEnvironments: ['production'],
                expirationDate: futureDate,
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .set('X-Forwarded-For', '192.168.1.100')
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(202);
        });

        it('should reject request when any constraint fails', async () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 30);

            testApiKey.constraints = {
                ipRestrictions: {
                    allowedIps: ['192.168.1.0/24'],
                },
                allowedEnvironments: ['production'],
                expirationDate: futureDate,
            };

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .set('X-Forwarded-For', '192.168.1.100')
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'development',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(403);
            expect(response.body.constraint).toBe('allowedEnvironments');
        });
    });

    describe('No Constraints', () => {
        it('should allow request when no constraints are configured', async () => {
            testApiKey.constraints = {};

            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);

            const response = await request(app)
                .post('/api/v1/logs')
                .set('X-API-Key', testApiKey.key)
                .send({
                    level: 'error',
                    message: 'Test log message',
                    environment: 'production',
                    projectId: testProject.projectId,
                    logType: 'application',
                });

            expect(response.status).toBe(202);
        });
    });
});
