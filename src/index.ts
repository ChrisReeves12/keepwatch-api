import express, { Express } from 'express';
import dotenv from 'dotenv';
import v1Routes from './routes/v1routes';
import { connectToDatabase, closeDatabaseConnection } from './database/connection';
import { createUserIndexes } from './services/users.service';
import { createProjectIndexes } from './services/projects.service';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3300;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/v1', v1Routes);

// Start server
async function startServer() {
    try {
        // Connect to MongoDB before starting the server
        await connectToDatabase();
        await createUserIndexes();
        await createProjectIndexes();

        app.listen(PORT, () => {
            console.log(`🚀 API is running on port ${PORT}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n⚠️  Shutting down gracefully...');
    await closeDatabaseConnection();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n⚠️  Shutting down gracefully...');
    await closeDatabaseConnection();
    process.exit(0);
});

// Start the server
startServer();

