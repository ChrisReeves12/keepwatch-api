import { Request, Response } from 'express';

import {
    createSubscriptionPlan,
    listSubscriptionPlans as listPlans,
    deleteSubscriptionPlan as removeSubscriptionPlan,
    updateSubscriptionPlan as modifySubscriptionPlan,
} from '../services/subscription.service';
import { CreateSubscriptionPlanInput, UpdateSubscriptionPlanInput } from '../types/subscription.types';

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

function validateCreateSubscriptionPlanPayload(body: any): { valid: boolean; missing: string[] } {
    const missing = REQUIRED_PLAN_FIELDS.filter(field => typeof body?.[field] === 'undefined' || body[field] === null);
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

