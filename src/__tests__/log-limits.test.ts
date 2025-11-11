import request from 'supertest';
import express, { Express } from 'express';
import { authenticateApiKey } from '../middleware/api-key.middleware';
import { createLog } from '../controllers/logs.controller';
import * as ProjectsService from '../services/projects.service';
import * as UsersService from '../services/users.service';
import * as UsageService from '../services/usage.service';
import * as MailService from '../services/mail.service';
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

beforeEach(() => {
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

    jest.clearAllMocks();
});

describe('Log Limit Tests', () => {
    describe('Log creation with usage limits', () => {
        it('should allow log creation when under the limit', async () => {
            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'basic',
                logLimit: 10000,
            });
            jest.spyOn(UsageService, 'checkAndIncrementOwnerUsage').mockResolvedValue({
                allowed: true,
                current: 5000,
            });

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
            expect(response.body.message).toBe('Log accepted for processing');
            expect(UsageService.checkAndIncrementOwnerUsage).toHaveBeenCalledWith(
                testUser._id,
                testUser.createdAt,
                1,
                10000
            );
        });

        it('should reject log creation when at the limit', async () => {
            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'basic',
                logLimit: 10000,
            });
            jest.spyOn(UsageService, 'checkAndIncrementOwnerUsage').mockResolvedValue({
                allowed: false,
                current: 10000,
            });
            jest.spyOn(UsageService, 'getBillingPeriod').mockReturnValue({
                start: new Date('2025-01-01'),
                end: new Date('2025-02-01'),
                periodKey: '20250101',
            });
            jest.spyOn(UsageService, 'hasSentLimitEmail').mockResolvedValue(true);

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

            expect(response.status).toBe(429);
            expect(response.body.error).toBe('Monthly log limit exceeded');
            expect(response.body.limit).toBe(10000);
            expect(response.body.current).toBe(10000);
            expect(response.body.periodStart).toBeDefined();
            expect(response.body.periodEnd).toBeDefined();
        });

        it('should reject log creation when over the limit', async () => {
            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'basic',
                logLimit: 10000,
            });
            jest.spyOn(UsageService, 'checkAndIncrementOwnerUsage').mockResolvedValue({
                allowed: false,
                current: 10500,
            });
            jest.spyOn(UsageService, 'getBillingPeriod').mockReturnValue({
                start: new Date('2025-01-01'),
                end: new Date('2025-02-01'),
                periodKey: '20250101',
            });
            jest.spyOn(UsageService, 'hasSentLimitEmail').mockResolvedValue(true);

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

            expect(response.status).toBe(429);
            expect(response.body.error).toBe('Monthly log limit exceeded');
            expect(response.body.current).toBe(10500);
        });

        it('should allow log creation when logLimit is undefined (unlimited)', async () => {
            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'unlimited',
                logLimit: undefined,
            });
            jest.spyOn(UsageService, 'checkAndIncrementOwnerUsage').mockResolvedValue({
                allowed: true,
                current: 100000,
            });

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
            expect(response.body.message).toBe('Log accepted for processing');
        });

        it('should send email notification on first limit exceeded', async () => {
            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'basic',
                logLimit: 10000,
            });
            jest.spyOn(UsageService, 'checkAndIncrementOwnerUsage').mockResolvedValue({
                allowed: false,
                current: 10000,
            });
            jest.spyOn(UsageService, 'getBillingPeriod').mockReturnValue({
                start: new Date('2025-01-01'),
                end: new Date('2025-02-01'),
                periodKey: '20250101',
            });
            jest.spyOn(UsageService, 'hasSentLimitEmail').mockResolvedValue(false);
            jest.spyOn(UsersService, 'findUserById').mockResolvedValue(testUser);
            const sendEmailSpy = jest.spyOn(MailService, 'sendEmail');
            const markLimitEmailSentSpy = jest.spyOn(UsageService, 'markLimitEmailSent');

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

            expect(response.status).toBe(429);
            expect(sendEmailSpy).toHaveBeenCalledWith(
                [testUser.email],
                'Monthly Log Limit Reached - KeepWatch',
                expect.stringContaining('Monthly Log Limit Reached')
            );
            expect(markLimitEmailSentSpy).toHaveBeenCalledWith(testUser._id, '20250101');
        });

        it('should not send email notification if already sent for the period', async () => {
            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'basic',
                logLimit: 10000,
            });
            jest.spyOn(UsageService, 'checkAndIncrementOwnerUsage').mockResolvedValue({
                allowed: false,
                current: 10000,
            });
            jest.spyOn(UsageService, 'getBillingPeriod').mockReturnValue({
                start: new Date('2025-01-01'),
                end: new Date('2025-02-01'),
                periodKey: '20250101',
            });
            jest.spyOn(UsageService, 'hasSentLimitEmail').mockResolvedValue(true);
            const sendEmailSpy = jest.spyOn(MailService, 'sendEmail');

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

            expect(response.status).toBe(429);
            expect(sendEmailSpy).not.toHaveBeenCalled();
        });

        it('should handle email sending failure gracefully', async () => {
            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'basic',
                logLimit: 10000,
            });
            jest.spyOn(UsageService, 'checkAndIncrementOwnerUsage').mockResolvedValue({
                allowed: false,
                current: 10000,
            });
            jest.spyOn(UsageService, 'getBillingPeriod').mockReturnValue({
                start: new Date('2025-01-01'),
                end: new Date('2025-02-01'),
                periodKey: '20250101',
            });
            jest.spyOn(UsageService, 'hasSentLimitEmail').mockResolvedValue(false);
            jest.spyOn(UsersService, 'findUserById').mockResolvedValue(testUser);
            jest.spyOn(MailService, 'sendEmail').mockRejectedValue(new Error('Email service unavailable'));

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

            expect(response.status).toBe(429);
            expect(response.body.error).toBe('Monthly log limit exceeded');
        });

        it('should allow log creation at exactly one below the limit', async () => {
            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'basic',
                logLimit: 10000,
            });
            jest.spyOn(UsageService, 'checkAndIncrementOwnerUsage').mockResolvedValue({
                allowed: true,
                current: 9999,
            });

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
            expect(response.body.message).toBe('Log accepted for processing');
        });

        it('should handle zero log limit', async () => {
            jest.spyOn(ProjectsService, 'findProjectByApiKey').mockResolvedValue(testProject);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'free',
                logLimit: 0,
            });
            jest.spyOn(UsageService, 'checkAndIncrementOwnerUsage').mockResolvedValue({
                allowed: false,
                current: 0,
            });
            jest.spyOn(UsageService, 'getBillingPeriod').mockReturnValue({
                start: new Date('2025-01-01'),
                end: new Date('2025-02-01'),
                periodKey: '20250101',
            });
            jest.spyOn(UsageService, 'hasSentLimitEmail').mockResolvedValue(true);

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

            expect(response.status).toBe(429);
            expect(response.body.error).toBe('Monthly log limit exceeded');
            expect(response.body.limit).toBe(0);
            expect(response.body.current).toBe(0);
        });
    });
});
