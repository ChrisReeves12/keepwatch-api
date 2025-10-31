import { Request, Response } from 'express';
import { appVersion } from "../config/app.config";

export const getHealth = (req: Request, res: Response): void => {
    res.json({
        status: 'KeepWatch API: Status OK',
        version: appVersion,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
    });
};

