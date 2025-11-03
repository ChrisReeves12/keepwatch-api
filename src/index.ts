import express, { Express } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import v1Routes from './routes/v1routes';
import { connectToFirestore, closeFirestoreConnection } from './database/firestore.connection';
import { createUserIndexes } from './services/users.service';
import { createProjectIndexes } from './services/projects.service';
import { createLogIndexes } from './services/logs.service';
import { createLogsTypesenseCollection } from './services/typesense.service';
import { connectToRedis, closeRedisConnection, isCachingEnabled } from './services/redis.service';
import { swaggerSpec } from './config/swagger.config';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3300;

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = [
            'https://keepwatch.io',
            'http://localhost:5173'
        ];

        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'KeepWatch API Documentation',
}));

// Routes
app.use('/api/v1', v1Routes);

// Start server
async function startServer() {
    try {
        // Connect to Firestore before starting the server
        await connectToFirestore();
        await createUserIndexes();
        await createProjectIndexes();
        await createLogIndexes();

        // Initialize Typesense collections
        await createLogsTypesenseCollection();

        // Connect to Redis if caching is enabled
        if (isCachingEnabled()) {
            try {
                await connectToRedis();
            } catch (error) {
                console.warn('⚠️  Redis connection failed, continuing without cache:', error);
            }
        }

        app.listen(PORT, () => {
            console.log(`API is running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await closeFirestoreConnection();
    await closeRedisConnection();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down gracefully...');
    await closeFirestoreConnection();
    await closeRedisConnection();
    process.exit(0);
});

// Start the server
startServer();

