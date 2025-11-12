import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client();

export interface GoogleTokenPayload {
    sub: string; // Google user ID
    email: string;
    email_verified: boolean;
    name: string;
    picture?: string;
}

/**
 * Verify a Google ID token and extract user information
 * @param token - Google ID token to verify
 * @returns Decoded token payload or null if invalid
 */
export async function verifyGoogleToken(token: string): Promise<GoogleTokenPayload | null> {
    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
        });

        const payload = ticket.getPayload();

        if (!payload) {
            return null;
        }

        // Ensure required fields are present
        if (!payload.sub || !payload.email || typeof payload.email_verified !== 'boolean') {
            return null;
        }

        return {
            sub: payload.sub,
            email: payload.email,
            email_verified: payload.email_verified,
            name: payload.name || payload.email.split('@')[0],
            picture: payload.picture,
        };
    } catch (error) {
        console.error('Error verifying Google token:', error);
        return null;
    }
}
