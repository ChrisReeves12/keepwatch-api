import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createTestApp } from '../helpers/test-app.helper';
import { createTestToken, createAuthHeader } from '../helpers/auth.helper';
import { createTestUser, createTestProject } from '../helpers/db.helper';
import { getDatabase } from '../../database/connection';
import { findProjectByProjectId } from '../../services/projects.service';
import { ProjectUser } from '../../types/project.types';

const app = createTestApp();

describe('Project User Roles Integration Tests', () => {
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

        const adminObjectId = typeof adminUser._id === 'string' ? new ObjectId(adminUser._id) : adminUser._id;
        testProject = await createTestProject(
            {
                name: `Test Project ${timestamp} ${randomSuffix}`,
                description: 'A test project',
            },
            adminObjectId
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
        const db = getDatabase();
        if (!db) {
            throw new Error('Database not connected');
        }

        const projectsCollection = db.collection('projects');
        const editorObjectId = typeof editorUser._id === 'string' ? new ObjectId(editorUser._id) : editorUser._id;
        const viewerObjectId = typeof viewerUser._id === 'string' ? new ObjectId(viewerUser._id) : viewerUser._id;

        const editorProjectUser: ProjectUser = {
            id: editorObjectId,
            role: 'editor',
        };

        const viewerProjectUser: ProjectUser = {
            id: viewerObjectId,
            role: 'viewer',
        };

        // Fetch the project, update users array, and save
        const project = await projectsCollection.findOne({ projectId: testProject.projectId });
        if (project) {
            const updatedUsers = [
                ...(project.users || []),
                editorProjectUser,
                viewerProjectUser,
            ];
            await projectsCollection.updateOne(
                { projectId: testProject.projectId },
                { $set: { users: updatedUsers } }
            );
        }
    });

    describe('PUT /api/v1/projects/:projectId/users/:userId/role', () => {
        it('should successfully update a user role from viewer to editor as admin', async () => {
            const viewerObjectId = typeof viewerUser._id === 'string' ? new ObjectId(viewerUser._id) : viewerUser._id;

            const response = await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${viewerObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(adminToken))
                .send({ role: 'editor' })
                .expect(200);

            expect(response.body).toHaveProperty('message', 'User role updated successfully');
            expect(response.body).toHaveProperty('project');

            // Verify the role was actually updated
            const updatedProject = await findProjectByProjectId(testProject.projectId);
            const updatedUser = updatedProject?.users.find(u => u.id.toString() === viewerObjectId.toString());
            expect(updatedUser?.role).toBe('editor');
        });

        it('should successfully update a user role from editor to admin as admin', async () => {
            const editorObjectId = typeof editorUser._id === 'string' ? new ObjectId(editorUser._id) : editorUser._id;

            const response = await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${editorObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(adminToken))
                .send({ role: 'admin' })
                .expect(200);

            expect(response.body).toHaveProperty('message', 'User role updated successfully');

            // Verify the role was updated to admin
            const updatedProject = await findProjectByProjectId(testProject.projectId);
            const updatedUser = updatedProject?.users.find(u => u.id.toString() === editorObjectId.toString());
            expect(updatedUser?.role).toBe('admin');
        });

        it('should successfully downgrade a user from admin to editor as admin', async () => {
            const viewerObjectId = typeof viewerUser._id === 'string' ? new ObjectId(viewerUser._id) : viewerUser._id;

            // First upgrade viewer to admin
            await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${viewerObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(adminToken))
                .send({ role: 'admin' });

            // Then downgrade to editor
            const response = await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${viewerObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(adminToken))
                .send({ role: 'editor' })
                .expect(200);

            expect(response.body).toHaveProperty('message', 'User role updated successfully');

            // Verify the role is now editor
            const updatedProject = await findProjectByProjectId(testProject.projectId);
            const updatedUser = updatedProject?.users.find(u => u.id.toString() === viewerObjectId.toString());
            expect(updatedUser?.role).toBe('editor');
        });

        it('should return 401 without authentication', async () => {
            const viewerObjectId = typeof viewerUser._id === 'string' ? new ObjectId(viewerUser._id) : viewerUser._id;

            const response = await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${viewerObjectId.toString()}/role`)
                .send({ role: 'editor' })
                .expect(401);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('token');
        });

        it('should return 400 when role is not provided', async () => {
            const viewerObjectId = typeof viewerUser._id === 'string' ? new ObjectId(viewerUser._id) : viewerUser._id;

            const response = await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${viewerObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(adminToken))
                .send({})
                .expect(400);

            expect(response.body).toHaveProperty('error', 'Missing required field: role');
        });

        it('should return 400 when role is invalid', async () => {
            const viewerObjectId = typeof viewerUser._id === 'string' ? new ObjectId(viewerUser._id) : viewerUser._id;

            const response = await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${viewerObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(adminToken))
                .send({ role: 'invalid-role' })
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Invalid role');
        });

        it('should return 400 when userId format is invalid', async () => {
            const response = await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/invalid-user-id/role`)
                .set('Authorization', createAuthHeader(adminToken))
                .send({ role: 'editor' })
                .expect(400);

            expect(response.body).toHaveProperty('error', 'Invalid user ID format');
        });

        it('should return 403 when non-admin tries to update roles', async () => {
            const viewerObjectId = typeof viewerUser._id === 'string' ? new ObjectId(viewerUser._id) : viewerUser._id;

            const response = await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${viewerObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(editorToken))
                .send({ role: 'admin' })
                .expect(403);

            expect(response.body).toHaveProperty('error', 'Forbidden: Only project admins can modify user roles');
        });

        it('should return 403 when viewer tries to update roles', async () => {
            const editorObjectId = typeof editorUser._id === 'string' ? new ObjectId(editorUser._id) : editorUser._id;

            const response = await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${editorObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(viewerToken))
                .send({ role: 'admin' })
                .expect(403);

            expect(response.body).toHaveProperty('error', 'Forbidden: Only project admins can modify user roles');
        });

        it('should return 403 when user not in project tries to update roles', async () => {
            const viewerObjectId = typeof viewerUser._id === 'string' ? new ObjectId(viewerUser._id) : viewerUser._id;

            const response = await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${viewerObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(otherUserToken))
                .send({ role: 'editor' })
                .expect(403);

            expect(response.body).toHaveProperty('error', 'Forbidden: Only project admins can modify user roles');
        });

        it('should return 404 when project does not exist', async () => {
            const viewerObjectId = typeof viewerUser._id === 'string' ? new ObjectId(viewerUser._id) : viewerUser._id;

            const response = await request(app)
                .put(`/api/v1/projects/non-existent-project/users/${viewerObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(adminToken))
                .send({ role: 'editor' })
                .expect(404);

            expect(response.body).toHaveProperty('error', 'Project not found');
        });

        it('should return 404 when user is not a member of the project', async () => {
            const otherObjectId = typeof otherUser._id === 'string' ? new ObjectId(otherUser._id) : otherUser._id;

            const response = await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${otherObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(adminToken))
                .send({ role: 'editor' })
                .expect(404);

            expect(response.body).toHaveProperty('error', 'User is not a member of this project');
        });

        it('should prevent admin from removing their own admin role', async () => {
            const adminObjectId = typeof adminUser._id === 'string' ? new ObjectId(adminUser._id) : adminUser._id;

            const response = await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${adminObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(adminToken))
                .send({ role: 'editor' })
                .expect(400);

            expect(response.body).toHaveProperty('error', 'Admins cannot remove their own admin role');

            // Verify role is still admin
            const project = await findProjectByProjectId(testProject.projectId);
            const admin = project?.users.find(u => u.id.toString() === adminObjectId.toString());
            expect(admin?.role).toBe('admin');
        });

        it('should allow admin to change another admin role', async () => {
            const editorObjectId = typeof editorUser._id === 'string' ? new ObjectId(editorUser._id) : editorUser._id;

            // First promote editor to admin
            await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${editorObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(adminToken))
                .send({ role: 'admin' });

            // Then demote that admin to editor
            const response = await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${editorObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(adminToken))
                .send({ role: 'editor' })
                .expect(200);

            expect(response.body).toHaveProperty('message', 'User role updated successfully');

            // Verify the role is now editor
            const project = await findProjectByProjectId(testProject.projectId);
            const updatedUser = project?.users.find(u => u.id.toString() === editorObjectId.toString());
            expect(updatedUser?.role).toBe('editor');
        });

        it('should support all valid role values', async () => {
            const viewerObjectId = typeof viewerUser._id === 'string' ? new ObjectId(viewerUser._id) : viewerUser._id;

            const roles = ['viewer', 'editor', 'admin'];

            for (const role of roles) {
                const response = await request(app)
                    .put(`/api/v1/projects/${testProject.projectId}/users/${viewerObjectId.toString()}/role`)
                    .set('Authorization', createAuthHeader(adminToken))
                    .send({ role })
                    .expect(200);

                expect(response.body).toHaveProperty('message', 'User role updated successfully');

                // Verify the role was updated
                const project = await findProjectByProjectId(testProject.projectId);
                const updatedUser = project?.users.find(u => u.id.toString() === viewerObjectId.toString());
                expect(updatedUser?.role).toBe(role);
            }
        });

        it('should update updatedAt timestamp when role changes', async () => {
            const viewerObjectId = typeof viewerUser._id === 'string' ? new ObjectId(viewerUser._id) : viewerUser._id;

            const projectBefore = await findProjectByProjectId(testProject.projectId);
            const updatedAtBefore = projectBefore?.updatedAt;

            // Small delay to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${viewerObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(adminToken))
                .send({ role: 'admin' });

            const projectAfter = await findProjectByProjectId(testProject.projectId);
            const updatedAtAfter = projectAfter?.updatedAt;

            expect(updatedAtAfter).not.toEqual(updatedAtBefore);
            expect(new Date(updatedAtAfter!).getTime()).toBeGreaterThan(new Date(updatedAtBefore!).getTime());
        });

        it('should allow admin to promote admin to admin (no change)', async () => {
            const adminObjectId = typeof adminUser._id === 'string' ? new ObjectId(adminUser._id) : adminUser._id;

            const response = await request(app)
                .put(`/api/v1/projects/${testProject.projectId}/users/${adminObjectId.toString()}/role`)
                .set('Authorization', createAuthHeader(adminToken))
                .send({ role: 'admin' })
                .expect(200);

            expect(response.body).toHaveProperty('message', 'User role updated successfully');

            // Verify role is still admin
            const project = await findProjectByProjectId(testProject.projectId);
            const admin = project?.users.find(u => u.id.toString() === adminObjectId.toString());
            expect(admin?.role).toBe('admin');
        });
    });
});
