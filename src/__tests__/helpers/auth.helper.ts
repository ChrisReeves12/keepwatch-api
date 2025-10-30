import { createToken, JWTPayload } from '../../services/jwt.service';

/**
 * Create a JWT token for testing
 * @param userId - User ID for the token
 * @param email - Email for the token
 * @returns JWT token string
 */
export function createTestToken(userId: string, email: string): string {
    const payload: JWTPayload = {
        userId,
        email,
    };
    return createToken(payload);
}

/**
 * Create authorization header value for testing
 * @param token - JWT token string
 * @returns Authorization header value
 */
export function createAuthHeader(token: string): string {
    return `Bearer ${token}`;
}

