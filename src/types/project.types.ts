/**
 * Project user with role
 */
export interface ProjectUser {
    id: string; // Firestore document ID
    role: 'viewer' | 'editor' | 'admin';
}

/**
 * IP restrictions for API key
 */
export interface IpRestrictions {
    allowedIps: string[]; // Array of IP addresses or CIDR ranges (e.g., ["192.168.1.1", "10.0.0.0/8"])
}

/**
 * HTTP Referer restrictions for API key
 */
export interface RefererRestrictions {
    allowedReferers: string[]; // Array of allowed referer patterns (e.g., ["https://example.com/*"])
}

/**
 * Rate limiting configuration for API key
 */
export interface RateLimits {
    requestsPerMinute?: number;
    requestsPerHour?: number;
    requestsPerDay?: number;
}

/**
 * Origin restrictions for API key (CORS-style)
 */
export interface OriginRestrictions {
    allowedOrigins: string[]; // Array of allowed origin patterns
}

/**
 * User agent restrictions for API key
 */
export interface UserAgentRestrictions {
    allowedPatterns: string[]; // Array of regex patterns for user agents
}

/**
 * Complete constraint configuration for API key
 * All constraints must pass (AND logic) for the API key to be valid
 */
export interface ApiKeyConstraints {
    ipRestrictions?: IpRestrictions;
    refererRestrictions?: RefererRestrictions;
    rateLimits?: RateLimits;
    expirationDate?: Date;
    allowedEnvironments?: string[]; // Array of allowed environment names
    originRestrictions?: OriginRestrictions;
    userAgentRestrictions?: UserAgentRestrictions;
}

/**
 * API key for a project
 */
export interface ProjectApiKey {
    id: string;
    key: string;
    createdAt: Date;
    constraints?: ApiKeyConstraints; // Configuration that limits API key usage
}

/**
 * Project interface representing a project document in Firestore
 */
export interface Project {
    _id?: string; // Firestore document ID
    name: string;
    description?: string;
    projectId: string; // User-friendly slug identifier
    users: ProjectUser[];
    apiKeys?: ProjectApiKey[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Project creation input
 */
export interface CreateProjectInput {
    name: string;
    description?: string;
}

/**
 * Project update input
 */
export interface UpdateProjectInput {
    name?: string;
    description?: string;
    users?: ProjectUser[];
}

/**
 * API key update input
 */
export interface UpdateApiKeyInput {
    constraints?: ApiKeyConstraints;
}
