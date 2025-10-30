import { Request, Response } from 'express';

export const getHealth = (req: Request, res: Response): void => {
    res.json({
        status: 'KeepWatch API: Status OK',
        version: process.env.VERSION,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
    });
};

