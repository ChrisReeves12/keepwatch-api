# KeepWatch API

A Node.js Express API built with TypeScript.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

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

Create a `.env` file in the root directory with your configuration. See `.env.example` for reference.

