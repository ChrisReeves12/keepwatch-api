import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Ensure environment variables are loaded even if this module is imported early
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
}

// Ensure TypeScript knows JWT_SECRET is a string
const secret: string = JWT_SECRET;

export interface JWTPayload {
    userId: string;
    email: string;
}

/**
 * Create a JWT token with userId and email claims
 * @param payload - JWT payload containing userId and email
 * @returns JWT token string
 */
export function createToken(payload: JWTPayload): string {
    return jwt.sign(payload, secret, {
        expiresIn: process.env.JWT_EXPIRY as `${number}d` || '7d',
    });
}

/**
 * Verify and decode a JWT token
 * @param token - JWT token string
 * @returns Decoded JWT payload or null if invalid
 */
export function verifyToken(token: string): JWTPayload | null {
    try {
        const decoded = jwt.verify(token, secret) as jwt.JwtPayload;

        // Validate that the decoded token has the required fields
        if (decoded && typeof decoded === 'object' && 'userId' in decoded && 'email' in decoded) {
            return {
                userId: decoded.userId as string,
                email: decoded.email as string,
            };
        }

        return null;
    } catch (error) {
        return null;
    }
}

