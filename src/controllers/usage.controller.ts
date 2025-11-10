import { Request, Response } from 'express';
import * as UsersService from '../services/users.service';
import * as UsageService from '../services/usage.service';

/**
 * @swagger
 * /api/v1/usage/quota:
 *   get:
 *     summary: Get current user's quota information
 *     description: Returns the authenticated user's current usage and quota information for the current billing period
 *     tags: [Usage]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Quota information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logUsage:
 *                   type: object
 *                   properties:
 *                     current:
 *                       type: number
 *                       description: Current number of logs used in the billing period
 *                       example: 2500
 *                     limit:
 *                       type: number
 *                       nullable: true
 *                       description: Maximum number of logs allowed in the billing period (null when unlimited)
 *                       example: 10000
 *                     remaining:
 *                       type: number
 *                       nullable: true
 *                       description: Number of logs remaining in the billing period (null when unlimited)
 *                       example: 7500
 *                     percentUsed:
 *                       type: number
 *                       nullable: true
 *                       description: Percentage of quota used (null when unlimited)
 *                       example: 25.0
 *                     isUnlimited:
 *                       type: boolean
 *                       description: Indicates whether the log usage is unlimited
 *                       example: false
 *                 billingPeriod:
 *                   type: object
 *                   properties:
 *                     start:
 *                       type: string
 *                       format: date-time
 *                       description: Start of the current billing period
 *                       example: "2024-11-01T00:00:00.000Z"
 *                     end:
 *                       type: string
 *                       format: date-time
 *                       description: End of the current billing period
 *                       example: "2024-12-01T00:00:00.000Z"
 *                     daysRemaining:
 *                       type: number
 *                       description: Number of days remaining in the billing period
 *                       example: 15
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
export const getUserQuota = async (req: Request, res: Response): Promise<void> => {
    try {
        // Verify JWT authentication
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
            });
            return;
        }

        // Get the current user
        const currentUser = await UsersService.findUserByUserId(req.user.userId);
        if (!currentUser || !currentUser._id) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }

        // Get user's usage metadata (cached for 10 minutes)
        const usageMetadata = await UsersService.getUserCreatedAtAndEnrollment(currentUser._id);
        if (!usageMetadata) {
            res.status(500).json({
                error: 'User usage metadata not found',
            });
            return;
        }

        // Get quota information
        const quota = await UsageService.getUserQuota(
            currentUser._id,
            usageMetadata.userCreatedAt,
            usageMetadata.logLimit
        );

        res.json(quota);
    } catch (error: any) {
        console.error('Error fetching user quota:', error);
        res.status(500).json({
            error: 'Failed to fetch user quota',
            details: error.message,
        });
    }
};

