import { Request, Response } from 'express';
import { appVersion } from "../config/app.config";
import { getRedisClient, isCachingEnabled } from '../services/redis.service';
import { getDatabase } from '../database/connection';
import { getTypesenseClient } from '../services/typesense.service';

export const getHealth = async (req: Request, res: Response): Promise<void> => {
    const health: any = {
        status: 'KeepWatch API: Status OK',
        version: appVersion,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
    };

    // Check MongoDB connectivity
    try {
        const db = getDatabase();
        if (db) {
            await db.admin().ping();
            health.mongodb = {
                status: 'connected',
            };
        } else {
            health.mongodb = {
                status: 'disconnected',
                message: 'MongoDB client not initialized',
            };
        }
    } catch (error) {
        health.mongodb = {
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

