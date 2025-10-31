/**
 * User interface representing a user document in Firestore
 */
export interface User {
    _id?: string; // Firestore document ID
    name: string;
    email: string;
    password: string;
    userId: string; // Unique machine-readable identifier (slug)
    company?: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * User creation input
 */
export interface CreateUserInput {
    name: string;
    email: string;
    password: string;
    company?: string;
}

/**
 * User update input (all fields optional except userId)
 */
export interface UpdateUserInput {
    name?: string;
    email?: string;
    password?: string;
    company?: string;
}
