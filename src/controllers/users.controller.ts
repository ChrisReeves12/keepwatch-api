import { Request, Response } from 'express';
import * as UsersService from '../services/users.service';
import { CreateUserInput, UpdateUserInput } from '../types/user.types';
import { sendEmail } from '../services/mail.service';
import { generateEmailVerificationCode, storeEmailVerificationCode } from '../services/email-verification.service';
import { getSubscriptionPlanEnrollmentByUserId, findSubscriptionPlanByMachineName } from '../services/subscription.service';
import * as ProjectInvitesService from '../services/project-invites.service';

/**
 * @swagger
 * /api/v1/users:
 *   post:
 *     summary: Create a new user
 *     description: Register a new user account
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserInput'
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User created successfully
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: User with this email already exists
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
export const createUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const userData: CreateUserInput = req.body;
        const { inviteId, inviteToken } = req.body;

        // Validate required fields
        if (!userData.name || !userData.email || !userData.password) {
            res.status(400).json({
                error: 'Missing required fields: name, email, password',
            });
            return;
        }

        // If inviteId and inviteToken are provided, validate the invite
        if (inviteId && inviteToken) {
            const invite = await ProjectInvitesService.verifyProjectInvite(inviteId, inviteToken);

            if (!invite) {
                res.status(403).json({
                    error: 'Invalid or expired invite',
                });
                return;
            }

            // Verify that the email matches the invite recipient email
            if (userData.email.trim().toLowerCase() !== invite.recipientEmail.toLowerCase()) {
                res.status(403).json({
                    error: 'Email does not match the invite recipient',
                });
                return;
            }

            // Store the inviteId in userData to be saved with the user
            (userData as any).inviteId = inviteId;
        }

        // Check if email already exists
        if (await UsersService.emailExists(userData.email.trim().toLowerCase())) {
            res.status(409).json({
                error: 'User with this email already exists',
            });
            return;
        }

        const user = await UsersService.createUser(userData);

// If inviteId was provided, update the invite's recipientUserId
if (inviteId && user._id) {
    try {
        await ProjectInvitesService.updateInviteRecipientUserId(inviteId, user._id);
    } catch (error) {
        console.error('Error updating invite recipientUserId:', error);
        // Don't fail user creation if invite update fails
    }
}

        // If inviteId was provided, update the invite's recipientUserId
        if (inviteId && user._id) {
            try {
                await ProjectInvitesService.updateInviteRecipientUserId(inviteId, user._id);
            } catch (inviteUpdateError) {
                console.error('Error updating invite recipient user ID:', inviteUpdateError);
                // Continue with user creation even if invite update fails
            }
        }

        // Remove password from response
        const { password, ...userResponse } = user;

        const createdUserPayload = {
            ...userResponse,
            emailVerifiedAt: user.emailVerifiedAt ?? null,
            is2FARequired: user.is2FARequired ?? false,
        };

        try {
            const code = generateEmailVerificationCode();
            await storeEmailVerificationCode(user.userId, user.email, code, user._id);

            const emailContent = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Welcome to KeepWatch!</h2>
                    <p>Thanks for signing up. Use the verification code below to confirm your email address:</p>
                    <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
                        <h1 style="color: #28a745; font-size: 32px; letter-spacing: 5px; margin: 0;">${code}</h1>
                    </div>
                    <p>This code will expire in 15 minutes.</p>
                    <p>If you didn't create this account, you can safely ignore this email.</p>
                </div>
            `;

            await sendEmail(
                [user.email],
                'Verify Your Email - KeepWatch',
                emailContent
            );
        } catch (otpError) {
            console.error('Error sending verification email:', otpError);
        }

        res.status(201).json({
            message: 'User created successfully',
            user: createdUserPayload,
        });
    } catch (error: any) {
        console.error('Error creating user:', error);
        res.status(500).json({
            error: 'Failed to create user',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/users/me:
 *   get:
 *     summary: Get current user
 *     description: Get the currently authenticated user's information
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
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
export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const userId = req.user.userId;
        const user = await UsersService.findUserByUserId(userId);

        if (!user) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        // Remove password from response
        const { password, ...userResponse } = user;

        const userPayload = {
            ...userResponse,
            emailVerifiedAt: user.emailVerifiedAt ?? null,
            is2FARequired: user.is2FARequired ?? false,
            timezone: user.timezone ?? null,
        };

        const subscriptionPlanEnrollment = await getSubscriptionPlanEnrollmentByUserId(user.userId);

        res.json({
            user: userPayload,
            subscriptionPlanEnrollment: subscriptionPlanEnrollment ?? null,
        });
    } catch (error: any) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            error: 'Failed to fetch user',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/users/me/subscription:
 *   get:
 *     summary: Get current user's subscription enrollment
 *     description: Retrieve the full subscription plan enrollment details for the currently authenticated user. Returns null if the user is on a free plan.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription enrollment retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscriptionPlanEnrollment:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/SubscriptionPlanEnrollment'
 *                     - type: 'null'
 *       401:
 *         description: Authentication required
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
export const getCurrentUserSubscription = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const userId = req.user.userId;
        const subscriptionPlanEnrollment = await getSubscriptionPlanEnrollmentByUserId(userId);

        if (!subscriptionPlanEnrollment) {
            res.json({
                subscriptionPlanEnrollment: null,
            });
            return;
        }

        // Fetch the full subscription plan details
        const subscriptionPlan = await findSubscriptionPlanByMachineName(subscriptionPlanEnrollment.subscriptionPlan);

        res.json({
            subscriptionPlanEnrollment: {
                ...subscriptionPlanEnrollment,
                subscriptionPlanDetails: subscriptionPlan,
            },
        });
    } catch (error: any) {
        console.error('Error fetching subscription enrollment:', error);
        res.status(500).json({
            error: 'Failed to fetch subscription enrollment',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/users/me:
 *   put:
 *     summary: Update current user
 *     description: Update the currently authenticated user's information
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserInput'
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User updated successfully
 *                 user:
 *                   $ref: '#/components/schemas/User'
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
 *       409:
 *         description: User with this email already exists
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
export const updateCurrentUser = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const userId = req.user.userId;
        const updateData: UpdateUserInput = req.body;

        if (typeof updateData.is2FARequired !== 'undefined' && typeof updateData.is2FARequired !== 'boolean') {
            res.status(400).json({
                error: 'Invalid value for is2FARequired. Expected a boolean.',
            });
            return;
        }

        // Check if user exists
        const existingUser = await UsersService.findUserByUserId(userId);
        if (!existingUser) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        // If email is being updated, check if new email already exists
        if (updateData.email && updateData.email.trim().toLowerCase() !== existingUser.email) {
            if (await UsersService.emailExists(updateData.email.trim().toLowerCase())) {
                res.status(409).json({
                    error: 'User with this email already exists',
                });
                return;
            }
        }

        const updatedUser = await UsersService.updateUser(userId, updateData);

        if (!updatedUser) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        // Remove password from response
        const { password, ...userResponse } = updatedUser;

        res.json({
            message: 'User updated successfully',
            user: {
                ...userResponse,
                emailVerifiedAt: updatedUser.emailVerifiedAt ?? null,
                is2FARequired: updatedUser.is2FARequired ?? false,
            },
        });
    } catch (error: any) {
        console.error('Error updating user:', error);
        res.status(500).json({
            error: 'Failed to update user',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/users/me/delete/request:
 *   post:
 *     summary: Request account deletion verification code
 *     description: Generates a 6-digit verification code and sends it to the user's email. The code expires in 15 minutes and must be used in the DELETE /api/v1/users/me endpoint to confirm account deletion.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification code sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Account deletion verification code has been sent to your email.
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
export const requestAccountDeletion = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const userId = req.user.userId;

        // Get user details
        const user = await UsersService.findUserByUserId(userId);
        if (!user) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        // Generate and store deletion code
        const code = UsersService.generateDeletionCode();
        await UsersService.storeDeletionCode(user.email, userId, code);

        // Send email with deletion code
        const emailContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Account Deletion Request</h2>
                <p>You requested to delete your KeepWatch account. Use the following code to confirm the deletion:</p>
                <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
                    <h1 style="color: #dc3545; font-size: 32px; letter-spacing: 5px; margin: 0;">${code}</h1>
                </div>
                <p><strong style="color: #dc3545;">Warning:</strong> This action is permanent and will:</p>
                <ul style="color: #666;">
                    <li>Remove you from all projects you are a member of</li>
                    <li>Delete all projects you own</li>
                    <li>Delete all logs associated with your owned projects</li>
                    <li>Delete your account permanently</li>
                </ul>
                <p>This code will expire in 15 minutes.</p>
                <p>If you didn't request this, please ignore this email and your account will remain safe.</p>
            </div>
        `;

        await sendEmail(
            [user.email],
            'Account Deletion Verification Code - KeepWatch',
            emailContent
        );

        res.json({
            message: 'Account deletion verification code has been sent to your email.',
        });
    } catch (error: any) {
        console.error('Error requesting account deletion:', error);
        res.status(500).json({
            error: 'Failed to process account deletion request',
            details: error.message,
        });
    }
};

/**
 * @swagger
 * /api/v1/users/me:
 *   delete:
 *     summary: Delete current user
 *     description: |
 *       Delete the currently authenticated user's account. Requires a 6-digit verification code sent via POST /api/v1/users/me/delete/request.
 *       This performs a cascade delete:
 *       1. Removes user from all projects they are a member of
 *       2. Deletes all projects owned by the user
 *       3. Deletes all logs associated with those owned projects
 *       4. Deletes the user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
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
 *                 description: 6-digit verification code from email
 *                 example: '123456'
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User deleted successfully
 *       400:
 *         description: Missing or invalid verification code
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required or invalid verification code
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
export const deleteCurrentUser = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        const userId = req.user.userId;
        const { code } = req.body;

        // Validate required fields
        if (!code) {
            res.status(400).json({
                error: 'Missing required field: code',
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

        // Validate the deletion code
        const isValidCode = await UsersService.validateDeletionCode(userId, code);

        if (!isValidCode) {
            res.status(401).json({
                error: 'Invalid or expired verification code',
            });
            return;
        }

        // Proceed with deletion
        const deleted = await UsersService.deleteUser(userId);

        if (!deleted) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        res.json({
            message: 'User deleted successfully',
        });
    } catch (error: any) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            error: 'Failed to delete user',
            details: error.message,
        });
    }
};

