import { Request, Response } from 'express';
import * as SystemAdminService from '../services/system-admins.service';
import { verifyPassword } from '../services/crypt.service';
import { createToken } from '../services/jwt.service';

/**
 * @swagger
 * /api/v1/admin/auth:
 *   post:
 *     summary: Authenticate a system admin
 *     description: Validate system admin credentials and issue a JWT for privileged access.
 *     tags: [System Admin Authentication]
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
 *                 example: admin@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: securePassword!123
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
 *                 systemAdmin:
 *                   type: object
 *                   description: Authenticated system admin profile
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: dXNlcjEyMw==
 *                     name:
 *                       type: string
 *                       example: Jane Doe
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: admin@example.com
 *                     role:
 *                       type: string
 *                       enum: [superuser, editor, viewer]
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
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
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function authenticate(req: Request, res: Response): Promise<void> {
    try {
        const { email, password } = req.body;

        // Validate required fields
        if (!email || !password) {
            res.status(400).json({
                error: 'Missing required fields: email, password',
            });
            return;
        }

        const systemAdmin = await SystemAdminService.findSystemAdminByEmail(email.trim().toLowerCase());

        if (!systemAdmin) {
            res.status(401).json({
                error: 'Invalid email or password',
            });
            return;
        }

        // Verify password
        const isPasswordValid = await verifyPassword(password, systemAdmin.password);

        if (!isPasswordValid) {
            res.status(401).json({
                error: 'Invalid email or password',
            });
            return;
        }

        const { password: _, ...systemAdminResponse } = systemAdmin;

        // Create JWT token
        const token = createToken({
            userId: systemAdmin._id!,
            email: systemAdmin.email,
        });

        res.json({
            message: 'Authentication successful',
            token,
            systemAdmin: systemAdminResponse,
        });
    } catch (error: any) {
        console.error('Error authenticating system admin:', error);
        res.status(500).json({
            error: 'Failed to authenticate system admin',
            details: error.message,
        });
    }
}
