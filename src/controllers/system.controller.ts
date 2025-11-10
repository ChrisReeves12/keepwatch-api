import { Request, Response } from 'express';

import {
    createSubscriptionPlan,
    listSubscriptionPlans as listPlans,
    deleteSubscriptionPlan as removeSubscriptionPlan,
    updateSubscriptionPlan as modifySubscriptionPlan,
    createSubscriptionPlanEnrollment as createPlanEnrollment,
    listAllSubscriptionPlanEnrollments,
    getSubscriptionPlanEnrollmentByUserId,
} from '../services/subscription.service';
import {
    CreateSubscriptionPlanInput,
    UpdateSubscriptionPlanInput,
    CreateSubscriptionPlanEnrollmentInput,
} from '../types/subscription.types';
import { findUserByEmail, findUserByUserId } from '../services/users.service';

/**
 * @swagger
 * tags:
 *   name: System
 *   description: System-level administration endpoints (requires system admin token)
 */

const REQUIRED_PLAN_FIELDS: Array<keyof CreateSubscriptionPlanInput> = [
    'name',
    'machineName',
    'listPrice',
    'billingInterval',
];

const REQUIRED_ENROLLMENT_FIELDS: Array<keyof CreateSubscriptionPlanEnrollmentInput> = [
    'userId',
    'subscriptionPlan',
    'price',
];

function validateCreateSubscriptionPlanPayload(body: any): { valid: boolean; missing: string[] } {
    const missing = REQUIRED_PLAN_FIELDS.filter(field => typeof body?.[field] === 'undefined' || body[field] === null);
    return {
        valid: missing.length === 0,
        missing,
    };
}

function validateCreateSubscriptionPlanEnrollmentPayload(body: any): { valid: boolean; missing: string[] } {
    const missing = REQUIRED_ENROLLMENT_FIELDS.filter(field => typeof body?.[field] === 'undefined' || body[field] === null);
    return {
        valid: missing.length === 0,
        missing,
    };
}

function validateUpdateSubscriptionPlanPayload(body: any): { valid: boolean } {
    const updatableFields: Array<keyof UpdateSubscriptionPlanInput> = [
        'name',
        'listPrice',
        'logLimit',
        'projectLimit',
        'billingInterval',
    ];

    const hasUpdates = updatableFields.some(field => typeof body?.[field] !== 'undefined');

    return { valid: hasUpdates };
}

/**
 * @swagger
 * /api/v1/system/subscription-plans:
 *   post:
 *     summary: Create a subscription plan
 *     description: Create a new subscription plan. Only system admins with role `superadmin`, `superuser`, or `editor` may perform this action.
 *     tags: [System]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - machineName
 *               - listPrice
 *               - billingInterval
 *             properties:
 *               name:
 *                 type: string
 *                 example: Pro Plan
 *               machineName:
 *                 type: string
 *                 description: Slug identifier for the plan
 *                 example: pro-plan
 *               listPrice:
 *                 type: number
 *                 example: 499
 *               logLimit:
 *                 type: number
 *                 nullable: true
 *                 description: Monthly log limit. Omit or set to null for unlimited.
 *                 example: 100000
 *               projectLimit:
 *                 type: number
 *                 nullable: true
 *                 description: Project limit. Omit or set to null for unlimited.
 *                 example: 50
 *               billingInterval:
 *                 type: string
 *                 enum: [monthly, yearly]
 *                 example: monthly
 *     responses:
 *       201:
 *         description: Subscription plan created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Subscription plan created successfully
 *                 subscriptionPlan:
 *                   $ref: '#/components/schemas/SubscriptionPlan'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: System admin authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to create subscription plan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function createPlan(req: Request, res: Response): Promise<void> {
    try {
        const validation = validateCreateSubscriptionPlanPayload(req.body);

        if (!validation.valid) {
            res.status(400).json({
                error: `Missing required fields: ${validation.missing.join(', ')}`,
            });
            return;
        }

        const payload = req.body as CreateSubscriptionPlanInput;
        const plan = await createSubscriptionPlan(payload);

        res.status(201).json({
            message: 'Subscription plan created successfully',
            subscriptionPlan: plan,
        });
    } catch (error: any) {
        console.error('Failed to create subscription plan:', error);
        res.status(500).json({
            error: 'Failed to create subscription plan',
            details: error.message,
        });
    }
}

/**
 * @swagger
 * /api/v1/system/subscription-plans:
 *   get:
 *     summary: List subscription plans
 *     description: Retrieve all subscription plans. Requires a valid system admin token.
 *     tags: [System]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of subscription plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscriptionPlans:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SubscriptionPlan'
 *       401:
 *         description: System admin authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to list subscription plans
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function listSubscriptionPlans(_req: Request, res: Response): Promise<void> {
    try {
        const plans = await listPlans();

        res.json({
            subscriptionPlans: plans,
        });
    } catch (error: any) {
        console.error('Failed to list subscription plans:', error);
        res.status(500).json({
            error: 'Failed to list subscription plans',
            details: error.message,
        });
    }
}

/**
 * @swagger
 * /api/v1/system/subscription-plans/{machineName}:
 *   put:
 *     summary: Update a subscription plan
 *     description: Update an existing subscription plan's details. Only system admins with role `superadmin`, `superuser`, or `editor` may perform this action.
 *     tags: [System]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: machineName
 *         in: path
 *         required: true
 *         description: Machine name (slug) of the subscription plan
 *         schema:
 *           type: string
 *           example: pro-plan
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Pro Plan Plus
 *               listPrice:
 *                 type: number
 *                 example: 599
 *               logLimit:
 *                 type: number
 *                 nullable: true
 *                 example: 200000
 *               projectLimit:
 *                 type: number
 *                 nullable: true
 *                 example: 100
 *               billingInterval:
 *                 type: string
 *                 enum: [monthly, yearly]
 *                 example: yearly
 *     responses:
 *       200:
 *         description: Subscription plan updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Subscription plan updated successfully
 *                 subscriptionPlan:
 *                   $ref: '#/components/schemas/SubscriptionPlan'
 *       400:
 *         description: Missing machineName parameter or no update fields provided
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: System admin authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Subscription plan not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to update subscription plan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function updateSubscriptionPlan(req: Request, res: Response): Promise<void> {
    try {
        const { machineName } = req.params;

        if (!machineName) {
            res.status(400).json({
                error: 'Subscription plan machineName is required',
            });
            return;
        }

        const validation = validateUpdateSubscriptionPlanPayload(req.body);

        if (!validation.valid) {
            res.status(400).json({
                error: 'At least one updatable field must be provided',
            });
            return;
        }

        const payload = req.body as UpdateSubscriptionPlanInput;
        const plan = await modifySubscriptionPlan(machineName, payload);

        if (!plan) {
            res.status(404).json({
                error: `Subscription plan not found: ${machineName}`,
            });
            return;
        }

        res.json({
            message: 'Subscription plan updated successfully',
            subscriptionPlan: plan,
        });
    } catch (error: any) {
        console.error('Failed to update subscription plan:', error);
        res.status(500).json({
            error: 'Failed to update subscription plan',
            details: error.message,
        });
    }
}

/**
 * @swagger
 * /api/v1/system/subscription-plans/{machineName}:
 *   delete:
 *     summary: Delete a subscription plan
 *     description: Delete a subscription plan by machineName and cascade delete associated enrollments. Only system admins with role `superadmin`, `superuser`, or `editor` may perform this action.
 *     tags: [System]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: machineName
 *         in: path
 *         required: true
 *         description: Machine name (slug) of the subscription plan
 *         schema:
 *           type: string
 *           example: pro-plan
 *     responses:
 *       200:
 *         description: Subscription plan deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Subscription plan deleted successfully
 *       400:
 *         description: Missing machineName parameter
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: System admin authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Subscription plan not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to delete subscription plan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function deleteSubscriptionPlan(req: Request, res: Response): Promise<void> {
    try {
        const { machineName } = req.params;

        if (!machineName) {
            res.status(400).json({
                error: 'Subscription plan machineName is required',
            });
            return;
        }

        const deleted = await removeSubscriptionPlan(machineName);

        if (!deleted) {
            res.status(404).json({
                error: `Subscription plan not found: ${machineName}`,
            });
            return;
        }

        res.json({
            message: 'Subscription plan deleted successfully',
        });
    } catch (error: any) {
        console.error('Failed to delete subscription plan:', error);
        res.status(500).json({
            error: 'Failed to delete subscription plan',
            details: error.message,
        });
    }
}

/**
 * @swagger
 * /api/v1/system/subscription-plans/enrollments:
 *   post:
 *     summary: Create a subscription plan enrollment
 *     description: Assign a user to a subscription plan. Only system admins with role `superadmin` or `editor` may perform this action.
 *     tags: [System]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - subscriptionPlan
 *               - price
 *             properties:
 *               userId:
 *                 type: string
 *                 example: usr_12345
 *               subscriptionPlan:
 *                 type: string
 *                 description: Machine name (slug) of the subscription plan
 *                 example: pro-plan
 *               price:
 *                 type: number
 *                 example: 499
 *     responses:
 *       201:
 *         description: Subscription plan enrollment created successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: System admin authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Subscription plan not found
 *       409:
 *         description: User already enrolled in a subscription plan
 *       500:
 *         description: Failed to create subscription plan enrollment
 */
export async function createSubscriptionPlanEnrollment(req: Request, res: Response): Promise<void> {
    try {
        const validation = validateCreateSubscriptionPlanEnrollmentPayload(req.body);

        if (!validation.valid) {
            res.status(400).json({
                error: `Missing required fields: ${validation.missing.join(', ')}`,
            });
            return;
        }

        const payload = req.body as CreateSubscriptionPlanEnrollmentInput;
        const enrollment = await createPlanEnrollment(payload);

        res.status(201).json({
            message: 'Subscription plan enrollment created successfully',
            subscriptionPlanEnrollment: enrollment,
        });
    } catch (error: any) {
        console.error('Failed to create subscription plan enrollment:', error);
        let status = 500;
        let errorMessage = 'Failed to create subscription plan enrollment';

        if (error instanceof Error) {
            if (error.message.includes('already has a subscription plan enrollment')) {
                status = 409;
                errorMessage = error.message;
            }

            if (error.message.includes('does not exist')) {
                status = 404;
                errorMessage = error.message;
            }
        }

        res.status(status).json({
            error: errorMessage,
            details: error instanceof Error ? error.message : undefined,
        });
    }
}

/**
 * @swagger
 * /api/v1/system/subscription-plans/enrollments:
 *   get:
 *     summary: List subscription plan enrollments
 *     description: Retrieve subscription plan enrollments, optionally filtered by user email or userId. Only system admins with role `superadmin` or `editor` may perform this action.
 *     tags: [System]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         description: Filter enrollments by user email
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter enrollments by userId
 *     responses:
 *       200:
 *         description: Subscription plan enrollments retrieved successfully
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: System admin authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 *       500:
 *         description: Failed to list subscription plan enrollments
 */
export async function listSubscriptionPlanEnrollments(req: Request, res: Response): Promise<void> {
    try {
        const { email, userId } = req.query;

        if (email && userId) {
            res.status(400).json({
                error: 'Provide either email or userId, not both',
            });
            return;
        }

        if (email) {
            const normalizedEmail = String(email).trim().toLowerCase();
            const user = await findUserByEmail(normalizedEmail);

            if (!user) {
                res.status(404).json({
                    error: `User not found for email: ${normalizedEmail}`,
                });
                return;
            }

            const enrollment = await getSubscriptionPlanEnrollmentByUserId(user.userId);

            res.json({
                subscriptionPlanEnrollments: enrollment ? [enrollment] : [],
            });
            return;
        }

        if (userId) {
            const normalizedUserId = String(userId).trim();
            const user = await findUserByUserId(normalizedUserId);

            if (!user) {
                res.status(404).json({
                    error: `User not found for userId: ${normalizedUserId}`,
                });
                return;
            }

            const enrollment = await getSubscriptionPlanEnrollmentByUserId(normalizedUserId);

            res.json({
                subscriptionPlanEnrollments: enrollment ? [enrollment] : [],
            });
            return;
        }

        const enrollments = await listAllSubscriptionPlanEnrollments();

        res.json({
            subscriptionPlanEnrollments: enrollments,
        });
    } catch (error: any) {
        console.error('Failed to list subscription plan enrollments:', error);
        res.status(500).json({
            error: 'Failed to list subscription plan enrollments',
            details: error.message,
        });
    }
}

