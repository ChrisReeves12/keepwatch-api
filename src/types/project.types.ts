import { LogType, LogLevel } from "./log.types";

/**
 * Project user with role
 */
export interface ProjectUser {
    id: string; // Firestore document ID
    role: 'viewer' | 'editor' | 'admin';
}

/**
 * Project invite structure
 */
export interface ProjectInvite {
    _id: string;
    token: string;
    projectId: string;
    senderUserId: string;
    recipientEmail: string;
    recipientUserId: string | null;
    recipientRole: 'viewer' | 'editor' | 'admin';
    expiresAt: Date;
    createdAt: Date;
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
    ownerId: string; // Firestore document ID of the project owner
    users: ProjectUser[];
    apiKeys?: ProjectApiKey[];
    alarms?: ProjectAlarm[];
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

/**
 * Email delivery method for alarms
 */
export interface EmailDeliveryMethod {
    addresses: string[];
}

/**
 * Slack delivery method for alarms
 */
export interface SlackDeliveryMethod {
    webhook: string;
}

/**
 * Webhook delivery method for alarms
 */
export interface WebhookDeliveryMethod {
    url: string;
}

/**
 * Delivery methods for alarms
 */
export interface AlarmDeliveryMethods {
    email?: EmailDeliveryMethod;
    slack?: SlackDeliveryMethod;
    webhook?: WebhookDeliveryMethod;
}

/**
 * Project alarm configuration
 */
export interface ProjectAlarm {
    id: string;
    logType: LogType;
    message?: string; // null or undefined means "match any message"
    level: LogLevel | LogLevel[];
    environment: string;
    categories?: string[];
    deliveryMethods: AlarmDeliveryMethods;
}

/**
 * Create alarm input
 */
export type CreateAlarmInput = ProjectAlarm;
