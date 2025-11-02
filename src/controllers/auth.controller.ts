import { Request, Response } from 'express';
import * as UsersService from '../services/users.service';
import { verifyPassword } from '../services/crypt.service';
import { createToken } from '../services/jwt.service';
import { generateRecoveryCode, storeRecoveryCode, validateRecoveryCode } from '../services/password-recovery.service';
import { sendEmail } from '../services/mail.service';

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
        const user = await UsersService.findUserByEmail(email);

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

        // Create JWT token
        const token = createToken({
            userId: user.userId,
            email: user.email,
        });

        // Remove password from response
        const { password: _, ...userResponse } = user;

        res.json({
            message: 'Authentication successful',
            token,
            user: userResponse,
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

        // Check if user exists
        const user = await UsersService.findUserByEmail(email);

        // Always return success message to prevent email enumeration
        // But only send email if user exists
        if (user) {
            const code = generateRecoveryCode();
            await storeRecoveryCode(email, code);

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
                [email],
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

        const user = await UsersService.findUserByEmail(email);

        if (!user) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        const isValidCode = await validateRecoveryCode(email, code);

        if (!isValidCode) {
            res.status(401).json({
                error: 'Invalid or expired recovery code',
            });
            return;
        }

        await UsersService.updateUser(user.userId, { password: newPassword });

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

