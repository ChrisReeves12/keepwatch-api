import express, { Express } from 'express';
import v1Routes from '../../routes/v1routes';

/**
 * Create an Express app instance for testing
 * This is a separate instance from the main app to avoid side effects
 */
export function createTestApp(): Express {
    const app: Express = express();

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Routes
    app.use('/api/v1', v1Routes);

    return app;
}



