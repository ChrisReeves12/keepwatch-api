import { ObjectId, WithId } from 'mongodb';
import { getDatabase } from '../database/connection';
import { Project, CreateProjectInput, UpdateProjectInput, ProjectUser } from '../types/project.types';
import { slugify } from '../utils/slugify.util';

const COLLECTION_NAME = 'projects';

/**
 * Get the projects collection
 */
function getProjectsCollection() {
    const db = getDatabase();
    if (!db) {
        throw new Error('Database not connected');
    }
    return db.collection<Project>(COLLECTION_NAME);
}

/**
 * Convert MongoDB document to Project type
 */
function toProject(doc: WithId<Project> | null): Project | null {
    if (!doc) return null;
    const project = { ...doc } as Project;
    project._id = doc._id.toString();
    return project;
}

/**
 * Create indexes for the projects collection
 * Should be called once on application startup
 */
export async function createProjectIndexes(): Promise<void> {
    try {
        const collection = getProjectsCollection();

        // Create unique index on projectId
        await collection.createIndex({ projectId: 1 }, { unique: true });

        // Create index on users.id for faster lookups
        await collection.createIndex({ 'users.id': 1 });

        console.log('✅ Project indexes created');
    } catch (error) {
        console.error('❌ Failed to create project indexes:', error);
        throw error;
    }
}

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
 * @param creatorUserId - MongoDB ObjectId of the user creating the project
 * @returns Created project document
 */
export async function createProject(projectData: CreateProjectInput, creatorUserId: ObjectId): Promise<Project> {
    const collection = getProjectsCollection();

    // Generate unique projectId from name
    const projectId = await generateUniqueProjectId(projectData.name);

    // Create project user with creator as admin
    const creatorUser: ProjectUser = {
        id: creatorUserId,
        role: 'admin',
    };

    const now = new Date();
    const project: Project = {
        name: projectData.name,
        description: projectData.description,
        projectId,
        users: [creatorUser],
        createdAt: now,
        updatedAt: now,
    };

    const result = await collection.insertOne(project);

    if (!result.insertedId) {
        throw new Error('Failed to create project');
    }

    const createdProject = await collection.findOne({ _id: result.insertedId });
    if (!createdProject) {
        throw new Error('Failed to retrieve created project');
    }

    return toProject(createdProject)!;
}

/**
 * Find a project by projectId
 * @param projectId - The unique projectId identifier
 * @returns Project document or null
 */
export async function findProjectByProjectId(projectId: string): Promise<Project | null> {
    const collection = getProjectsCollection();
    const project = await collection.findOne({ projectId });
    return toProject(project);
}

/**
 * Find a project by MongoDB _id
 * @param id - MongoDB ObjectId string
 * @returns Project document or null
 */
export async function findProjectById(id: string): Promise<Project | null> {
    const collection = getProjectsCollection();

    if (!ObjectId.isValid(id)) {
        return null;
    }

    const project = await collection.findOne({ _id: new ObjectId(id) });
    return toProject(project);
}

/**
 * Get all projects for a specific user
 * @param userId - MongoDB ObjectId of the user
 * @returns Array of project documents
 */
export async function getProjectsByUserId(userId: ObjectId): Promise<Project[]> {
    const collection = getProjectsCollection();
    const projects = await collection
        .find({ 'users.id': userId })
        .sort({ createdAt: -1 })
        .toArray();
    return projects.map(project => toProject(project)!);
}

/**
 * Get all projects (with pagination)
 * @param limit - Maximum number of projects to return
 * @param skip - Number of projects to skip
 * @returns Array of project documents
 */
export async function getAllProjects(limit: number = 100, skip: number = 0): Promise<Project[]> {
    const collection = getProjectsCollection();
    const projects = await collection
        .find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .toArray();
    return projects.map(project => toProject(project)!);
}

/**
 * Update a project by projectId
 * @param projectId - The unique projectId identifier
 * @param updateData - Fields to update
 * @returns Updated project document or null
 */
export async function updateProject(projectId: string, updateData: UpdateProjectInput): Promise<Project | null> {
    const collection = getProjectsCollection();

    const updatedData: Partial<Project> = {
        ...updateData,
        updatedAt: new Date(),
    };

    const result = await collection.findOneAndUpdate(
        { projectId },
        { $set: updatedData },
        { returnDocument: 'after' }
    );

    return toProject(result);
}

/**
 * Delete a project by projectId
 * @param projectId - The unique projectId identifier
 * @returns true if project was deleted, false otherwise
 */
export async function deleteProject(projectId: string): Promise<boolean> {
    const collection = getProjectsCollection();
    const result = await collection.deleteOne({ projectId });
    return result.deletedCount === 1;
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
 * @param userId - MongoDB ObjectId of the user to remove
 */
export async function removeUserFromAllProjects(userId: ObjectId): Promise<void> {
    const collection = getProjectsCollection();
    await collection.updateMany(
        { 'users.id': userId },
        { $pull: { users: { id: userId } } }
    );
}

