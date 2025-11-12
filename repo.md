# KeepWatch API - Repository Documentation

## Overview
**KeepWatch API** is a production-ready Node.js Express REST API built with TypeScript for real-time log monitoring, management, and alerting. The system provides comprehensive log ingestion, full-text search capabilities, user authentication with Google OAuth support, project-based organization, and subscription management. It uses Google Cloud Firestore as the primary database, Typesense for powerful search functionality, Redis for caching, and Google Cloud Pub/Sub for asynchronous message processing.

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
- `firebase-admin` (13.5.0) - Firestore database management
- `typesense` (2.1.0) - Full-text search functionality
- `ioredis` (5.8.2) - Redis caching layer
- `@google-cloud/pubsub` (5.2.0) - Message queue for background workers
- `@google-cloud/functions-framework` (4.0.0) - Cloud Functions runtime
- `bcrypt` (6.0.0) - Password hashing and encryption
- `jsonwebtoken` (9.0.2) - JWT token generation and validation
- `google-auth-library` (10.5.0) - Google OAuth integration
- `cors` (2.8.5) - Cross-origin resource sharing
- `swagger-jsdoc` (6.2.8) & `swagger-ui-express` (5.0.1) - API documentation
- `mailgun.js` (12.1.1) - Email service integration
- `validator` (13.15.20) - Input validation
- `moment` (2.30.1) - Date/time manipulation
- `slack-notify` (2.0.7) - Slack notifications
- `ipaddr.js` (2.2.0) - IP address parsing

### Development Tools
- `tsx` (4.20.6) - TypeScript execution and hot-reload
- `jest` (30.2.0) & `ts-jest` (29.4.5) - Testing framework
- `supertest` (7.1.4) - HTTP endpoint testing
- `ioredis-mock` (8.13.1) - Redis mocking for tests
- `typescript` (5.3.3) - TypeScript compiler

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
│   │   ├── google-auth.service.ts
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

### Core Features

1. **Authentication & Authorization**
   - JWT-based authentication with access and refresh tokens
   - Google OAuth integration (Sign in with Google)
   - System administrator authentication
   - Two-factor authentication (2FA)
   - Email verification flow
   - Password recovery system
   - API key authentication for log ingestion

2. **User Management**
   - User registration with email verification
   - User profile management
   - Password management and recovery
   - User CRUD operations with proper authorization

3. **Project Management**
   - Multi-tenant project organization
   - Project creation and configuration
   - Project invitations system
   - Owner/member role management
   - Per-project API keys
   - Hostname configuration
   - Cascading updates when project ownership changes

4. **Log Management**
   - Real-time log ingestion via REST API
   - Asynchronous log processing with Pub/Sub
   - Full-text search with Typesense
   - Advanced log filtering and querying
   - Log alarm monitoring
   - Background workers for log processing
   - Usage tracking and rate limiting

5. **Usage & Analytics**
   - API usage metrics and tracking
   - Subscription tier management
   - Usage limits enforcement
   - Analytics dashboard data

6. **System Administration**
   - System admin user management
   - Health check endpoints
   - Console utilities for database operations

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

#### Request Flow
1. Client Request → CORS Middleware → Body Parser
2. Route Handler → Authentication Middleware → Controller
3. Controller → Service Layer → Database/Cache
4. Response ← Controller ← Service Layer

#### Background Processing Flow
1. Log API Request → Validation → Pub/Sub Topic
2. Pub/Sub → Log Ingestion Worker → Processing
3. Worker → Firestore (storage) + Typesense (indexing)
4. Log Alarm Worker → Monitors logs → Triggers notifications

### Key Components

#### Middleware (`src/middleware/`)
- `auth.middleware.ts` - JWT token validation for authenticated routes
- `api-key.middleware.ts` - API key validation for log ingestion
- `system-admin-auth.middleware.ts` - System administrator authorization
- CORS configuration for allowed origins (production + local dev)
- JSON body parsing with size limits

#### Services Layer (`src/services/`)
The service layer encapsulates all business logic and external integrations:

**Core Services:**
- `users.service.ts` - User CRUD, authentication, profile management
- `projects.service.ts` - Project management, invitations, access control
- `logs.service.ts` - Log ingestion, storage, retrieval
- `jwt.service.ts` - JWT token generation, validation, refresh
- `crypt.service.ts` - Password hashing with bcrypt

**Search & Cache:**
- `typesense.service.ts` - Full-text search index management
- `redis.service.ts` - Caching layer for performance optimization

**External Integrations:**
- `pubsub.service.ts` - Google Cloud Pub/Sub message publishing
- `mail.service.ts` - Email notifications via Mailgun
- `google-auth.service.ts` - Google OAuth authentication

**Feature Services:**
- `subscription.service.ts` - Subscription tier management
- `usage.service.ts` - Usage tracking and limits
- `two-factor.service.ts` - 2FA implementation
- `email-verification.service.ts` - Email verification workflow
- `password-recovery.service.ts` - Password reset functionality
- `project-invites.service.ts` - Project invitation system
- `system-admins.service.ts` - System admin management

#### Background Workers (`src/workers/`)
- `log-ingestion-worker.ts` - Consumes logs from Pub/Sub, stores in Firestore, indexes in Typesense
- `log-alarm-worker.ts` - Monitors logs for alarm conditions, sends notifications

#### Cloud Functions (`src/functions/`)
- `log-ingestion-function.ts` - HTTP Cloud Function for log ingestion
- Deployed to Google Cloud Functions for serverless scaling

#### Database Strategy
**Firestore Collections:**
- `users` - User profiles and authentication data
- `projects` - Project configurations and metadata
- `logs` - Log entries with timestamps and metadata
- `subscriptions` - Subscription tier information
- `system_admins` - System administrator accounts

**Indexes:**
- Composite indexes for efficient queries
- Automatic index creation on startup
- User indexes: email, created timestamps
- Project indexes: owner, members, timestamps
- Log indexes: project_id, timestamp, level

**Typesense Collections:**
- Logs collection with full-text search capabilities
- Automatic schema creation and updates
- Real-time indexing of new log entries

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

### Swagger/OpenAPI
Interactive API documentation is available at `/api-docs` when the server is running.

The Swagger UI provides:
- Complete endpoint documentation
- Request/response schemas
- Authentication requirements
- Try-it-out functionality for testing endpoints
- Model definitions

Access locally at: `http://localhost:3300/api-docs`

### API Endpoints

#### Authentication (`/api/v1/auth`)
- POST `/register` - User registration
- POST `/login` - User login
- POST `/refresh` - Refresh access token
- POST `/google` - Google OAuth sign-in
- POST `/verify-email` - Email verification
- POST `/forgot-password` - Password reset request
- POST `/reset-password` - Password reset confirmation

#### Admin Authentication (`/api/v1/admin/auth`)
- POST `/login` - System admin login

#### Users (`/api/v1/users`)
- GET `/me` - Get current user profile
- PUT `/me` - Update current user profile
- DELETE `/me` - Delete current user account

#### Projects (`/api/v1/projects`)
- GET `/` - List user's projects
- POST `/` - Create new project
- GET `/:id` - Get project details
- PUT `/:id` - Update project
- DELETE `/:id` - Delete project
- POST `/:id/invite` - Invite user to project
- POST `/:id/leave` - Leave project

#### Logs (`/api/v1/logs`)
- POST `/ingest` - Ingest log entries (API key auth)
- GET `/search` - Search logs with Typesense
- GET `/:projectId` - Get logs for project
- DELETE `/:id` - Delete log entry

#### Usage (`/api/v1/usage`)
- GET `/stats` - Get usage statistics
- GET `/limits` - Get usage limits

#### System (`/api/v1/system`)
- GET `/health` - Health check endpoint
- GET `/admins` - List system admins (admin only)
- POST `/admins` - Create system admin (admin only)

## Security Features

### Authentication & Authorization
- JWT tokens with configurable expiry (default 30 days)
- Refresh token rotation for enhanced security
- API key authentication for log ingestion endpoints
- System admin role separation
- Password hashing with bcrypt (cost factor: 10)

### CORS Configuration
Strictly configured allowed origins:
- `https://keepwatch.io` (production)
- `http://localhost:5173` (local development)

Requests from other origins are blocked.

### Input Validation
- Request body validation using validator library
- Email format validation
- Type checking with TypeScript
- Sanitization of user inputs

### Rate Limiting & Usage Controls
- Usage tracking per subscription tier
- Request rate limiting
- Storage quota enforcement

## Production Considerations

### Graceful Shutdown
The application properly handles shutdown signals:
- `SIGINT` and `SIGTERM` signals caught
- Firestore connections closed gracefully
- Redis connections cleaned up
- In-flight requests completed before shutdown

### Error Handling
- Centralized error handling in controllers
- Proper HTTP status codes
- Error logging with context
- User-friendly error messages

### Monitoring & Observability
- Health check endpoint for load balancers
- Console logging for development
- Cloud Logging integration for production
- Redis connection failure handling (continues without cache)

### Performance Optimization
- Redis caching layer (optional but recommended)
- Firestore index optimization
- Typesense for fast full-text search
- Connection pooling for Redis

## Testing

### Test Infrastructure
- Unit tests with Jest
- HTTP endpoint testing with Supertest
- Redis mocking with ioredis-mock
- TypeScript support via ts-jest
- Test coverage reporting

### Running Tests
```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Generate coverage report
npm run test:coverage
```

Test files are located in `src/__tests__/`

## Console Utilities

The project includes several CLI utilities for database management:

```bash
# List all Firestore collections
npm run console:list-collections

# Count documents in collections
npm run console:count-docs

# Drop a Firestore collection (dangerous!)
npm run console:drop-collection

# Manage Typesense
npm run console:drop-typesense
npm run console:typesense-schema
npm run console:search-typesense

# Create system administrator
npm run console:create-system-admin
```

## Recent Updates

Based on recent commits:
- Added Google Sign-In authentication integration
- Implemented cascading updates for project ownership changes
- Added hostname configuration for projects
- General stability improvements and updates

## Version

Current version: **1.0.0**

## License

ISC
