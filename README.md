# KeepWatch API

A Node.js Express API built with TypeScript, using Google Cloud Firestore as the database.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Docker and Docker Compose (for local development)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy the example environment file:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration

4. Start the Firestore emulator and other services:
```bash
docker-compose up -d
```

This will start:
- **Firestore Emulator** on `localhost:8080`
- **Typesense** on `localhost:8108`

### Development

Run the development server with hot-reload:
```bash
npm run dev
```

### Build

Build the TypeScript project:
```bash
npm run build
```

### Production

Run the production server:
```bash
npm start
```

## Project Structure

```
keepwatch-api/
├── src/
│   └── index.ts          # Main application entry point
├── dist/                 # Compiled JavaScript (generated)
├── .env.example          # Example environment variables
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Environment Variables

Create a `.env` file in the root directory with your configuration:

### Local Development
```env
# Firestore (uses emulator when this is set)
FIRESTORE_EMULATOR_HOST=localhost:8080
GOOGLE_CLOUD_PROJECT=keepwatch-dev

# Typesense
TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_API_KEY=typesense-dev-key
USE_TYPESENSE=true

# Redis (optional, for caching)
REDIS_HOST=localhost
REDIS_PORT=6379
USE_CACHE=true

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRY=7d

# Server
PORT=3300
NODE_ENV=development
```

### Production (Google Cloud)
```env
# Firestore (don't set FIRESTORE_EMULATOR_HOST in production)
GOOGLE_CLOUD_PROJECT=your-gcp-project-id

# Other variables remain the same...
```

