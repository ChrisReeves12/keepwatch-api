import { Request, Response } from 'express';
import * as UsersService from '../services/users.service';
import { verifyPassword } from '../services/crypt.service';
import { createToken } from '../services/jwt.service';
import { generateRecoveryCode, storeRecoveryCode, validateRecoveryCode } from '../services/password-recovery.service';
import { sendEmail } from '../services/mail.service';
import { generateEmailVerificationCode, storeEmailVerificationCode, validateEmailVerificationCode } from '../services/email-verification.service';
import { generateTwoFactorCode, storeTwoFactorCode, validateTwoFactorCode } from '../services/two-factor.service';
import * as ProjectInvitesService from '../services/project-invites.service';
import { verifyGoogleToken } from '../services/google-auth.service';

/**
 * @swagger
 * /api/v1/auth:
 *   post:
 *     summary: Authenticate a user
 *     description: Authenticate a user with email and password. Returns a JWT token upon successful authentication.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: password123
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Authentication successful
 *                 token:
 *                   type: string
 *                   description: JWT token for authenticated requests
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const authenticate = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        // Validate required fields
        if (!email || !password) {
            res.status(400).json({
                error: 'Missing required fields: email, password',
            });
            return;
        }

        // Find user by email
        const user = await UsersService.findUserByEmail(email.trim().toLowerCase());

        if (!user) {
            res.status(401).json({
                error: 'Invalid email or password',
            });
            return;
        }

        // Verify password
        const isPasswordValid = await verifyPassword(password, user.password);

        if (!isPasswordValid) {
            res.status(401).json({
                error: 'Invalid email or password',
            });
            return;
        }

        // Remove password from response
        const { password: _, ...userResponse } = user;
        const userPayload = {
            ...userResponse,
            emailVerifiedAt: user.emailVerifiedAt ?? null,
            is2FARequired: user.is2FARequired ?? false,
        };

        if (user.is2FARequired) {
            try {
                const code = generateTwoFactorCode();
                await storeTwoFactorCode(user.email, user.userId, code);

                const emailContent = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Two-Factor Authentication Code</h2>
                        <p>Use the verification code below to complete your sign-in:</p>
                        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
                            <h1 style="color: #007bff; font-size: 32px; letter-spacing: 5px; margin: 0;">${code}</h1>
                        </div>
                        <p>This code will expire in 15 minutes.</p>
                        <p>If you didn't attempt to sign in, you can safely ignore this email.</p>
                    </div>
                `;

                await sendEmail(
                    [user.email],
                    'Two-Factor Authentication Code - KeepWatch',
                    emailContent
                );
            } catch (error) {
                console.error('Error sending two-factor authentication email:', error);
                res.status(500).json({
                    error: 'Failed to send two-factor authentication code',
                });
                return;
            }

            res.json({
                message: 'Two-factor authentication required',
                token: '',
                is2FARequired: true,
                user: userPayload,
            });
            return;
        }

        // Create JWT token
        const token = createToken({
            userId: user.userId,
            email: user.email,
        });

        // Check if user has a pending invite
        let inviteDetails = null;
        if ((user as any).inviteId) {
            const invite = await ProjectInvitesService.findProjectInviteById((user as any).inviteId);
            if (invite) {
                inviteDetails = {
                    inviteId: invite._id,
                    inviteToken: invite.token,
                };
            }
        }

        res.json({
            message: 'Authentication successful',
            token,
            user: userPayload,
            ...(inviteDetails && inviteDetails),
        });
    } catch (error: any) {
        console.error('Error authenticating user:', error);
        res.status(500).json({
            error: 'Failed to authenticate user',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/auth/forgot-password:
 *   post:
 *     summary: Request password recovery code
 *     description: Generates a 6-digit recovery code and sends it to the user's email. The code expires in 15 minutes.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Recovery code sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: If an account exists with this email, a recovery code has been sent.
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;

        // Validate required fields
        if (!email) {
            res.status(400).json({
                error: 'Missing required field: email',
            });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Check if user exists
        const user = await UsersService.findUserByEmail(normalizedEmail);

        // Always return success message to prevent email enumeration
        // But only send email if user exists
        if (user) {
            const code = generateRecoveryCode();
            await storeRecoveryCode(normalizedEmail, code);

            // Send email with recovery code
            const emailContent = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Password Recovery</h2>
                    <p>You requested to reset your password. Use the following code to reset your password:</p>
                    <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
                        <h1 style="color: #007bff; font-size: 32px; letter-spacing: 5px; margin: 0;">${code}</h1>
                    </div>
                    <p>This code will expire in 15 minutes.</p>
                    <p>If you didn't request this code, please ignore this email.</p>
                </div>
            `;

            await sendEmail(
                [normalizedEmail],
                'Password Recovery Code - KeepWatch',
                emailContent
            );
        }

        res.json({
            message: 'If an account exists with this email, a recovery code has been sent.',
        });
    } catch (error: any) {
        console.error('Error processing forgot password request:', error);
        res.status(500).json({
            error: 'Failed to process password recovery request',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Reset password with recovery code
 *     description: Validates the recovery code and resets the user's password.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               code:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *                 description: 6-digit recovery code
 *                 example: '123456'
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 example: newPassword123
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password reset successfully
 *       400:
 *         description: Missing required fields or invalid code format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid or expired recovery code
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, code, newPassword } = req.body;

        // Validate required fields
        if (!email || !code || !newPassword) {
            res.status(400).json({
                error: 'Missing required fields: email, code, newPassword',
            });
            return;
        }

        // Validate code format (6 digits)
        if (!/^\d{6}$/.test(code)) {
            res.status(400).json({
                error: 'Invalid code format. Code must be 6 digits.',
            });
            return;
        }

        if (newPassword.length < 6) {
            res.status(400).json({
                error: 'Password must be at least 6 characters long',
            });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await UsersService.findUserByEmail(normalizedEmail);

        if (!user) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        const isValidCode = await validateRecoveryCode(normalizedEmail, code);

        if (!isValidCode) {
            res.status(401).json({
                error: 'Invalid or expired recovery code',
            });
            return;
        }

        await UsersService.updateUser(user.userId, { password: newPassword });
        await UsersService.markEmailVerified(user.userId);

        res.json({
            message: 'Password reset successfully',
        });
    } catch (error: any) {
        console.error('Error resetting password:', error);
        res.status(500).json({
            error: 'Failed to reset password',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/auth/verify-email:
 *   post:
 *     summary: Verify user email with OTP
 *     description: Validates a 6-digit verification code sent to the user's email and marks the email as verified.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *                 description: 6-digit verification code
 *                 example: '123456'
 *     responses:
 *       200:
 *         description: Email verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Email verified successfully
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Missing or invalid verification code
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid or expired verification code
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
    try {
        const { code } = req.body;

        if (!code) {
            res.status(400).json({
                error: 'Missing required field: code',
            });
            return;
        }

        if (!/^\d{6}$/.test(code)) {
            res.status(400).json({
                error: 'Invalid code format. Code must be 6 digits.',
            });
            return;
        }

        const verification = await validateEmailVerificationCode(code);

        if (!verification) {
            res.status(401).json({
                error: 'Invalid or expired verification code',
            });
            return;
        }

        const user = await UsersService.markEmailVerified(verification.userId);

        if (!user) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        const { password, ...userResponse } = user;

        res.json({
            message: 'Email verified successfully',
            user: userResponse,
        });
    } catch (error: any) {
        console.error('Error verifying email:', error);
        res.status(500).json({
            error: 'Failed to verify email',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/auth/verify-email/resend:
 *   post:
 *     summary: Resend email verification code
 *     description: Generates a new 6-digit verification code and sends it to the user's email.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Verification code resent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: If an account exists with this email, a verification code has been sent.
 *       400:
 *         description: Missing required fields or email already verified
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const resendVerificationEmail = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;

        if (!email) {
            res.status(400).json({
                error: 'Missing required field: email',
            });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await UsersService.findUserByEmail(normalizedEmail);

        if (!user) {
            res.json({
                message: 'If an account exists with this email, a verification code has been sent.',
            });
            return;
        }

        if (user.emailVerifiedAt) {
            res.status(400).json({
                error: 'Email is already verified',
            });
            return;
        }

        const code = generateEmailVerificationCode();
        await storeEmailVerificationCode(user.userId, user.email, code, user._id);

        const emailContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Verify Your Email</h2>
                <p>Use the verification code below to confirm your email address:</p>
                <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
                    <h1 style="color: #28a745; font-size: 32px; letter-spacing: 5px; margin: 0;">${code}</h1>
                </div>
                <p>This code will expire in 15 minutes.</p>
                <p>If you didn't request this, you can safely ignore this email.</p>
            </div>
        `;

        await sendEmail(
            [user.email],
            'Verify Your Email - KeepWatch',
            emailContent
        );

        res.json({
            message: 'Verification code sent successfully',
        });
    } catch (error: any) {
        console.error('Error resending verification email:', error);
        res.status(500).json({
            error: 'Failed to resend verification email',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/auth/verify-2fa:
 *   post:
 *     summary: Complete two-factor authentication
 *     description: Validates a 6-digit two-factor authentication code and returns a JWT token upon success.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               code:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *                 description: 6-digit two-factor authentication code
 *                 example: '123456'
 *     responses:
 *       200:
 *         description: Two-factor authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Authentication successful
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Missing required fields or invalid code format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid or expired two-factor authentication code
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const verifyTwoFactor = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            res.status(400).json({
                error: 'Missing required fields: email, code',
            });
            return;
        }

        if (!/^\d{6}$/.test(code)) {
            res.status(400).json({
                error: 'Invalid code format. Code must be 6 digits.',
            });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await UsersService.findUserByEmail(normalizedEmail);

        if (!user) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        const validationResult = await validateTwoFactorCode(normalizedEmail, code);

        if (!validationResult || validationResult.userId !== user.userId) {
            res.status(401).json({
                error: 'Invalid or expired two-factor authentication code',
            });
            return;
        }

        const token = createToken({
            userId: user.userId,
            email: user.email,
        });

        const { password, ...userResponse } = user;
        const userPayload = {
            ...userResponse,
            emailVerifiedAt: user.emailVerifiedAt ?? null,
            is2FARequired: user.is2FARequired ?? false,
        };

        // Check if user has a pending invite
        let inviteDetails = null;
        if ((user as any).inviteId) {
            const invite = await ProjectInvitesService.findProjectInviteById((user as any).inviteId);
            if (invite) {
                inviteDetails = {
                    inviteId: invite._id,
                    inviteToken: invite.token,
                };
            }
        }

        res.json({
            message: 'Authentication successful',
            token,
            user: userPayload,
            ...(inviteDetails && inviteDetails),
        });
    } catch (error: any) {
        console.error('Error verifying two-factor authentication code:', error);
        res.status(500).json({
            error: 'Failed to verify two-factor authentication code',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/auth/google:
 *   post:
 *     summary: Authenticate with Google OAuth
 *     description: Authenticate a user using Google ID token. Creates a new user account if one doesn't exist.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - googleIdToken
 *             properties:
 *               googleIdToken:
 *                 type: string
 *                 description: Google ID token from OAuth flow
 *                 example: eyJhbGciOiJSUzI1NiIsImtpZCI6IjI3M...
 *               timezone:
 *                 type: string
 *                 description: User's timezone (optional)
 *                 example: America/New_York
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT token for authenticated requests
 *                 userId:
 *                   type: string
 *                   description: User's unique identifier
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 isNewUser:
 *                   type: boolean
 *                   description: true if this was the user's first sign up
 *       400:
 *         description: Missing or invalid Google token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Email not verified with Google
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const googleAuth = async (req: Request, res: Response): Promise<void> => {
    try {
        const { googleIdToken, timezone } = req.body;

        // Validate required fields
        if (!googleIdToken) {
            res.status(400).json({
                error: 'Missing required field: googleIdToken',
            });
            return;
        }

        // Verify the Google token
        const googlePayload = await verifyGoogleToken(googleIdToken);

        if (!googlePayload) {
            res.status(400).json({
                error: 'Invalid Google token',
            });
            return;
        }

        // Check if email is verified by Google
        if (!googlePayload.email_verified) {
            res.status(401).json({
                error: 'Email not verified with Google',
            });
            return;
        }

        const normalizedEmail = googlePayload.email.trim().toLowerCase();
        let user = await UsersService.findUserByEmail(normalizedEmail);
        let isNewUser = false;

        if (user) {
            // User exists - link Google account if not already linked
            if (!user.googleId) {
                user = await UsersService.linkGoogleAccount(
                    user.userId,
                    googlePayload.sub,
                    googlePayload.picture
                );
            }
        } else {
            // User doesn't exist - create new user
            try {
                user = await UsersService.createGoogleUser({
                    googleId: googlePayload.sub,
                    email: normalizedEmail,
                    name: googlePayload.name,
                    profilePicture: googlePayload.picture,
                    timezone: timezone || 'UTC',
                });
                isNewUser = true;
            } catch (error: any) {
                if (error.message === 'Email already exists') {
                    // Race condition - user was created between check and creation
                    user = await UsersService.findUserByEmail(normalizedEmail);
                    if (user && !user.googleId) {
                        user = await UsersService.linkGoogleAccount(
                            user.userId,
                            googlePayload.sub,
                            googlePayload.picture
                        );
                    }
                } else {
                    throw error;
                }
            }
        }

        if (!user) {
            res.status(500).json({
                error: 'Failed to create or retrieve user',
            });
            return;
        }

        // Generate JWT token
        const token = createToken({
            userId: user.userId,
            email: user.email,
        });

        // Remove password from response
        const { password: _, ...userResponse } = user;
        const userPayload = {
            ...userResponse,
            emailVerifiedAt: user.emailVerifiedAt ?? null,
            is2FARequired: user.is2FARequired ?? false,
        };

        res.json({
            token,
            userId: user.userId,
            user: userPayload,
            isNewUser,
        });
    } catch (error: any) {
        console.error('Error authenticating with Google:', error);
        res.status(500).json({
            error: 'Failed to authenticate with Google',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/auth/google/link:
 *   post:
 *     summary: Link Google account to existing KeepWatch account
 *     description: Links a Google OAuth account to an authenticated KeepWatch user. Requires authentication via Bearer token.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - googleIdToken
 *             properties:
 *               googleIdToken:
 *                 type: string
 *                 description: Google ID token from OAuth flow
 *                 example: eyJhbGciOiJSUzI1NiIsImtpZCI6IjI3M...
 *     responses:
 *       200:
 *         description: Google account linked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Google account linked successfully
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     googleLinked:
 *                       type: boolean
 *       400:
 *         description: Invalid Google token or email mismatch
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Google account already linked to another account
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const linkGoogleAccount = async (req: Request, res: Response): Promise<void> => {
    try {
        // User is authenticated via middleware, user info is in req.user
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const { googleIdToken } = req.body;

        // Validate required fields
        if (!googleIdToken) {
            res.status(400).json({
                error: 'Missing required field: googleIdToken',
            });
            return;
        }

        // Verify the Google token
        const googlePayload = await verifyGoogleToken(googleIdToken);

        if (!googlePayload) {
            res.status(400).json({
                error: 'Invalid Google token',
            });
            return;
        }

        // Get the authenticated user
        const user = await UsersService.findUserByUserId(req.user.userId);

        if (!user) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        // Check that Google email matches KeepWatch account email
        const normalizedGoogleEmail = googlePayload.email.trim().toLowerCase();
        const normalizedUserEmail = user.email.trim().toLowerCase();

        if (normalizedGoogleEmail !== normalizedUserEmail) {
            res.status(400).json({
                error: 'Email mismatch. Google email must match KeepWatch account email.',
            });
            return;
        }

        // Check if this Google account is already linked to another user
        const existingGoogleUser = await UsersService.findUserByGoogleId(googlePayload.sub);

        if (existingGoogleUser && existingGoogleUser.userId !== user.userId) {
            res.status(409).json({
                error: 'This Google account is already linked to another KeepWatch account.',
            });
            return;
        }

        // Check if user already has a Google account linked
        if (user.googleId) {
            res.status(400).json({
                error: 'A Google account is already linked to this KeepWatch account.',
            });
            return;
        }

        // Link the Google account
        const updatedUser = await UsersService.linkGoogleAccount(
            user.userId,
            googlePayload.sub,
            googlePayload.picture
        );

        if (!updatedUser) {
            res.status(500).json({
                error: 'Failed to link Google account',
            });
            return;
        }

        res.json({
            message: 'Google account linked successfully',
            user: {
                id: updatedUser.userId,
                email: updatedUser.email,
                googleLinked: true,
            },
        });
    } catch (error: any) {
        console.error('Error linking Google account:', error);
        res.status(500).json({
            error: 'Failed to link Google account',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/auth/google/unlink:
 *   delete:
 *     summary: Unlink Google account from KeepWatch account
 *     description: Removes the Google OAuth link from an authenticated KeepWatch user. User must have a password set to prevent account lockout.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Google account unlinked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Google account unlinked successfully
 *       400:
 *         description: Cannot unlink - no password set or no Google account linked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const unlinkGoogleAccount = async (req: Request, res: Response): Promise<void> => {
    try {
        // User is authenticated via middleware, user info is in req.user
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        // Get the authenticated user
        const user = await UsersService.findUserByUserId(req.user.userId);

        if (!user) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        // Check if user has a Google account linked
        if (!user.googleId) {
            res.status(400).json({
                error: 'No Google account is linked to this KeepWatch account.',
            });
            return;
        }

        // Check if user has a password set (prevent lockout)
        // Empty string or no password means they can only login via Google
        if (!user.password || user.password === '') {
            res.status(400).json({
                error: 'Cannot unlink Google account. Please set a password first.',
            });
            return;
        }

        // Unlink the Google account
        const updatedUser = await UsersService.unlinkGoogleAccount(user.userId);

        if (!updatedUser) {
            res.status(500).json({
                error: 'Failed to unlink Google account',
            });
            return;
        }

        res.json({
            message: 'Google account unlinked successfully',
        });
    } catch (error: any) {
        console.error('Error unlinking Google account:', error);
        res.status(500).json({
            error: 'Failed to unlink Google account',
            details: error.message,
        });
    }
};

