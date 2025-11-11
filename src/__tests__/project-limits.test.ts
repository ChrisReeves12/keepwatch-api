import request from 'supertest';
import express, { Express } from 'express';
import { createProject } from '../controllers/projects.controller';
import * as ProjectsService from '../services/projects.service';
import * as UsersService from '../services/users.service';
import { User } from '../types/user.types';

let app: Express;
let testUser: User;

beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.user = { userId: 'test-user', email: 'test@example.com' };
        next();
    });
    app.post('/api/v1/projects', createProject);
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

    jest.clearAllMocks();
});

describe('Project Limit Tests', () => {
    describe('Project creation with limits', () => {
        it('should allow project creation when under the limit', async () => {
            jest.spyOn(UsersService, 'findUserByUserId').mockResolvedValue(testUser);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'basic',
                projectLimit: 5,
            });
            jest.spyOn(ProjectsService, 'countProjectsByOwnerId').mockResolvedValue(3);
            jest.spyOn(ProjectsService, 'createProject').mockResolvedValue({
                _id: 'new-project-id',
                name: 'New Project',
                projectId: 'new-project',
                ownerId: testUser._id!,
                users: [{ id: testUser._id!, role: 'admin' }],
                apiKeys: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const response = await request(app)
                .post('/api/v1/projects')
                .send({
                    name: 'New Project',
                });

            expect(response.status).toBe(201);
            expect(response.body.message).toBe('Project created successfully');
            expect(ProjectsService.countProjectsByOwnerId).toHaveBeenCalledWith(testUser._id);
        });

        it('should reject project creation when at the limit', async () => {
            jest.spyOn(UsersService, 'findUserByUserId').mockResolvedValue(testUser);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'basic',
                projectLimit: 5,
            });
            jest.spyOn(ProjectsService, 'countProjectsByOwnerId').mockResolvedValue(5);

            const response = await request(app)
                .post('/api/v1/projects')
                .send({
                    name: 'New Project',
                });

            expect(response.status).toBe(403);
            expect(response.body.error).toBe('Project limit exceeded');
            expect(response.body.limit).toBe(5);
            expect(response.body.current).toBe(5);
            expect(ProjectsService.countProjectsByOwnerId).toHaveBeenCalledWith(testUser._id);
        });

        it('should reject project creation when over the limit', async () => {
            jest.spyOn(UsersService, 'findUserByUserId').mockResolvedValue(testUser);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'basic',
                projectLimit: 3,
            });
            jest.spyOn(ProjectsService, 'countProjectsByOwnerId').mockResolvedValue(5);

            const response = await request(app)
                .post('/api/v1/projects')
                .send({
                    name: 'New Project',
                });

            expect(response.status).toBe(403);
            expect(response.body.error).toBe('Project limit exceeded');
            expect(response.body.limit).toBe(3);
            expect(response.body.current).toBe(5);
        });

        it('should allow project creation when projectLimit is undefined (unlimited)', async () => {
            jest.spyOn(UsersService, 'findUserByUserId').mockResolvedValue(testUser);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'unlimited',
                projectLimit: undefined,
            });
            jest.spyOn(ProjectsService, 'countProjectsByOwnerId').mockResolvedValue(100);
            jest.spyOn(ProjectsService, 'createProject').mockResolvedValue({
                _id: 'new-project-id',
                name: 'New Project',
                projectId: 'new-project',
                ownerId: testUser._id!,
                users: [{ id: testUser._id!, role: 'admin' }],
                apiKeys: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const response = await request(app)
                .post('/api/v1/projects')
                .send({
                    name: 'New Project',
                });

            expect(response.status).toBe(201);
            expect(response.body.message).toBe('Project created successfully');
            expect(ProjectsService.countProjectsByOwnerId).not.toHaveBeenCalled();
        });

        it('should allow project creation when projectLimit is null (unlimited)', async () => {
            jest.spyOn(UsersService, 'findUserByUserId').mockResolvedValue(testUser);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'unlimited',
            });
            jest.spyOn(ProjectsService, 'countProjectsByOwnerId').mockResolvedValue(100);
            jest.spyOn(ProjectsService, 'createProject').mockResolvedValue({
                _id: 'new-project-id',
                name: 'New Project',
                projectId: 'new-project',
                ownerId: testUser._id!,
                users: [{ id: testUser._id!, role: 'admin' }],
                apiKeys: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const response = await request(app)
                .post('/api/v1/projects')
                .send({
                    name: 'New Project',
                });

            expect(response.status).toBe(201);
            expect(response.body.message).toBe('Project created successfully');
            expect(ProjectsService.countProjectsByOwnerId).not.toHaveBeenCalled();
        });

        it('should allow project creation at exactly one below the limit', async () => {
            jest.spyOn(UsersService, 'findUserByUserId').mockResolvedValue(testUser);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'basic',
                projectLimit: 5,
            });
            jest.spyOn(ProjectsService, 'countProjectsByOwnerId').mockResolvedValue(4);
            jest.spyOn(ProjectsService, 'createProject').mockResolvedValue({
                _id: 'new-project-id',
                name: 'New Project',
                projectId: 'new-project',
                ownerId: testUser._id!,
                users: [{ id: testUser._id!, role: 'admin' }],
                apiKeys: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const response = await request(app)
                .post('/api/v1/projects')
                .send({
                    name: 'New Project',
                });

            expect(response.status).toBe(201);
            expect(response.body.message).toBe('Project created successfully');
        });

        it('should handle zero project limit', async () => {
            jest.spyOn(UsersService, 'findUserByUserId').mockResolvedValue(testUser);
            jest.spyOn(UsersService, 'getUserCreatedAtAndEnrollment').mockResolvedValue({
                userCreatedAt: testUser.createdAt,
                subscriptionPlanId: 'free',
                projectLimit: 0,
            });
            jest.spyOn(ProjectsService, 'countProjectsByOwnerId').mockResolvedValue(0);

            const response = await request(app)
                .post('/api/v1/projects')
                .send({
                    name: 'New Project',
                });

            expect(response.status).toBe(403);
            expect(response.body.error).toBe('Project limit exceeded');
            expect(response.body.limit).toBe(0);
            expect(response.body.current).toBe(0);
        });
    });
});
