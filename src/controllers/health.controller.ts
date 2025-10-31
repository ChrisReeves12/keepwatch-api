import { Request, Response } from 'express';
import { appVersion } from "../config/app.config";
import { getRedisClient, isCachingEnabled } from '../services/redis.service';
import { getTypesenseClient } from '../services/typesense.service';
import { getFirestore } from '../database/firestore.connection';

/**
 * @swagger
 * /api/v1:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the API and its dependencies (Firestore, Typesense, Redis)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Health status information
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
export const getHealth = async (req: Request, res: Response): Promise<void> => {
    const health: any = {
        status: 'KeepWatch API: Status OK',
        version: appVersion,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
    };

    // Check Firestore connectivity
    try {
        const db = getFirestore();
        if (db) {
            // Simple connectivity check - try to get a non-existent collection
            await db.collection('_health_check').limit(1).get();
            health.firestore = {
                status: 'connected',
            };
        } else {
            health.firestore = {
                status: 'disconnected',
                message: 'Firestore client not initialized',
            };
        }
    } catch (error) {
        health.firestore = {
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
        };
    }

    // Check Typesense connectivity
    try {
        const typesenseClient = getTypesenseClient();
        // Try to retrieve the logs collection as a connectivity check
        await typesenseClient.collections('logs').retrieve();
        health.typesense = {
            status: 'connected',
        };
    } catch (error: any) {
        // Check if it's a 404 (collection doesn't exist) vs actual connection error
        if (error?.httpStatus === 404) {
            // Collection doesn't exist, but Typesense is reachable
            health.typesense = {
                status: 'connected',
                message: 'Logs collection not found',
            };
        } else {
            health.typesense = {
                status: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    // Check Redis connectivity if caching is enabled
    if (isCachingEnabled()) {
        try {
            const redisClient = getRedisClient();
            if (redisClient) {
                await redisClient.ping();
                health.redis = {
                    status: 'connected',
                    caching: 'enabled',
                };
            } else {
                health.redis = {
                    status: 'disconnected',
                    caching: 'enabled',
                    message: 'Redis client not initialized',
                };
            }
        } catch (error) {
            health.redis = {
                status: 'error',
                caching: 'enabled',
                message: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    } else {
        health.redis = {
            status: 'disabled',
            caching: 'disabled',
        };
    }

    res.json(health);
};

