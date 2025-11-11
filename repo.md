# KeepWatch API - Repository Documentation

## Overview
**KeepWatch API** is a Node.js Express API built with TypeScript for log monitoring and management. It uses Google Cloud Firestore as the primary database, Typesense for search functionality, Redis for caching, and Google Cloud Pub/Sub for message queuing.

## Tech Stack

### Core Technologies
- **Runtime**: Node.js v20
- **Framework**: Express.js
- **Language**: TypeScript 5.3.3
- **Database**: Google Cloud Firestore
- **Search Engine**: Typesense 2.1.0
- **Cache**: Redis (ioredis 5.8.2)
- **Message Queue**: Google Cloud Pub/Sub
- **Authentication**: JWT (jsonwebtoken)

### Key Dependencies
- `firebase-admin` - Firestore database management
- `typesense` - Full-text search functionality
- `ioredis` - Redis caching
- `@google-cloud/pubsub` - Message queue for workers
- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT authentication
- `cors` - Cross-origin resource sharing
- `swagger-jsdoc` & `swagger-ui-express` - API documentation
- `mailgun.js` - Email service
- `validator` - Input validation

### Development Tools
- `tsx` - TypeScript execution and hot-reload
- `jest` & `ts-jest` - Testing framework
- `supertest` - HTTP testing
- `ioredis-mock` - Redis mocking for tests

## Project Structure

```
keepwatch-api/
├── src/
│   ├── config/           # Configuration files (Swagger, etc.)
│   ├── console/          # CLI scripts for database management
│   ├── controllers/      # Request handlers
│   │   ├── auth.controller.ts
│   │   ├── admin-auth.controller.ts
│   │   ├── users.controller.ts
│   │   ├── projects.controller.ts
│   │   ├── logs.controller.ts
│   │   ├── usage.controller.ts
│   │   ├── system.controller.ts
│   │   └── health.controller.ts
│   ├── database/         # Database connection logic
│   ├── functions/        # Google Cloud Functions
│   ├── helpers/          # Utility helper functions
│   ├── middleware/       # Express middleware
│   ├── routes/           # API route definitions
│   │   ├── v1routes.ts
│   │   ├── auth.routes.ts
│   │   ├── admin-auth.routes.ts
│   │   ├── users.routes.ts
│   │   ├── projects.routes.ts
│   │   ├── logs.routes.ts
│   │   ├── usage.routes.ts
│   │   └── system.routes.ts
│   ├── services/         # Business logic layer
│   │   ├── users.service.ts
│   │   ├── projects.service.ts
│   │   ├── logs.service.ts
│   │   ├── typesense.service.ts
│   │   ├── redis.service.ts
│   │   ├── pubsub.service.ts
│   │   ├── jwt.service.ts
│   │   ├── crypt.service.ts
│   │   ├── mail.service.ts
│   │   ├── subscription.service.ts
│   │   ├── usage.service.ts
│   │   ├── two-factor.service.ts
│   │   ├── email-verification.service.ts
│   │   ├── password-recovery.service.ts
│   │   ├── project-invites.service.ts
│   │   └── system-admins.service.ts
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   ├── workers/          # Background workers
│   │   ├── log-ingestion-worker.ts
│   │   └── log-alarm-worker.ts
│   ├── constants.ts      # Application constants
│   └── index.ts          # Main application entry point
├── scripts/              # Deployment and utility scripts
│   ├── deploy-function.sh
│   └── start-dev-firebase.sh
├── dist/                 # Compiled JavaScript output
├── .env.example          # Environment variables template
├── docker-compose.yml    # Local development services
├── Dockerfile            # Production container image
├── cloudbuild.yaml       # Google Cloud Build configuration
├── firebase.json         # Firebase emulator configuration
├── jest.config.js        # Jest testing configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Project dependencies and scripts
```

## API Features

### Core Modules
1. **Authentication & Authorization**
   - User authentication with JWT
   - Admin authentication
   - Two-factor authentication
   - Email verification
   - Password recovery

2. **User Management**
   - User registration and profiles
   - User CRUD operations

3. **Project Management**
   - Project creation and management
   - Project invitations
   - Multi-user project access

4. **Log Management**
   - Log ingestion and storage
   - Log search with Typesense
   - Log alarms and notifications
   - Background workers for processing

5. **Usage Tracking**
   - API usage metrics
   - Subscription management

6. **System Administration**
   - System admin management
   - Health checks

## Development Setup

### Prerequisites
- Node.js v18 or higher
- Docker and Docker Compose
- npm or yarn

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   ```

3. **Start local services** (Firestore, Typesense, Pub/Sub):
   ```bash
   docker-compose up -d
   ```

   This starts:
   - Firestore Emulator on `localhost:8080`
   - Typesense on `localhost:8108`
   - Pub/Sub Emulator on `localhost:8085`

4. **Run development server**:
   ```bash
   npm run dev
   ```

### Available Scripts

#### Development
- `npm run dev` - Start development server with hot-reload
- `npm run dev-debug` - Start with debugger on port 9229
- `npm run start:worker-dev` - Run log ingestion worker (dev mode)
- `npm run start:worker-alarm-dev` - Run log alarm worker (dev mode)

#### Production
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run production server
- `npm run start:worker` - Run log ingestion worker
- `npm run start:worker-alarm` - Run log alarm worker

#### Testing
- `npm test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report

#### Code Quality
- `npm run type-check` - TypeScript type checking
- `npm run lint` - ESLint code linting

#### Console Scripts
- `npm run console:list-collections` - List Firestore collections
- `npm run console:count-docs` - Count Firestore documents
- `npm run console:drop-collection` - Drop a Firestore collection
- `npm run console:drop-typesense` - Drop a Typesense collection
- `npm run console:typesense-schema` - Get Typesense schema
- `npm run console:search-typesense` - Search Typesense collection
- `npm run console:create-system-admin` - Create system admin user

## Environment Variables

### Required Variables
```env
# General
NODE_ENV=local
WEB_FRONTEND_URL=http://localhost:5173

# JWT Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRY=30d

# Typesense Search
TYPESENSE_API_KEY=typesense-dev-key
TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http

# Redis Cache
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=Password1!
REDIS_KEY_PREFIX=keepwatch
REDIS_TLS=false

# Google Cloud (Local Development)
GOOGLE_CLOUD_PROJECT=keepwatch-dev
FIRESTORE_EMULATOR_HOST=localhost:8080
PUBSUB_EMULATOR_HOST=localhost:8085

# Server
PORT=3300
```

## Architecture

### Application Flow
1. **Request** → Express middleware → Routes → Controllers → Services → Database/Cache
2. **Background Processing** → Pub/Sub → Workers → Services → Database

### Key Components

#### Middleware
- CORS configuration for allowed origins
- JSON body parsing
- Authentication/authorization checks

#### Services Layer
- Business logic separation
- Database operations
- External service integrations
- Caching strategies

#### Workers
- **Log Ingestion Worker**: Processes incoming logs from Pub/Sub queue
- **Log Alarm Worker**: Monitors logs and triggers alarms

#### Database Indexes
- User indexes for efficient queries
- Project indexes for access control
- Log indexes for search and filtering

## Deployment

### Docker
Build and run with Docker:
```bash
docker build -t keepwatch-api .
docker run -p 3300:3300 keepwatch-api
```

### Google Cloud Platform
- Uses Cloud Build (`cloudbuild.yaml`)
- Deploys to Google Cloud Run or Cloud Functions
- Firestore in production mode (no emulator)

## API Documentation
Swagger documentation available at `/api-docs` when server is running.

## CORS Configuration
Allowed origins:
- `https://keepwatch.io` (production)
- `http://localhost:5173` (local development)

## Graceful Shutdown
The application handles `SIGINT` and `SIGTERM` signals to:
- Close Firestore connections
- Close Redis connections
- Clean up resources before exit

## Testing
- Unit tests with Jest
- HTTP endpoint testing with Supertest
- Redis mocking with ioredis-mock
- Test coverage reporting

## License
ISC
