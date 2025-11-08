# Console Utilities

This directory contains utility scripts for managing Firestore and Typesense from the command line.

## Firestore Utilities

### List All Collections

Lists all Firestore collections with document counts.

```bash
npm run console:list-collections
```

### Count Documents

Count documents in a specific collection and show a sample document.

```bash
npm run console:count-docs <collection-name>
```

Example:
```bash
npm run console:count-docs logs
npm run console:count-docs projects
```

### Drop Collection

⚠️ **DANGEROUS** - Deletes all documents from a Firestore collection.

```bash
npm run console:drop-collection <collection-name>
```

With automatic confirmation (skip prompt):
```bash
npm run console:drop-collection <collection-name> --yes
```

Examples:
```bash
npm run console:drop-collection logs
npm run console:drop-collection logs --yes
```

**Note:** This action cannot be undone. A confirmation prompt will appear unless you use the `--yes` flag.

## Typesense Utilities

### Drop Typesense Collection

Deletes a Typesense collection.

```bash
npm run console:drop-typesense <collection-name>
```

Example:
```bash
npm run console:drop-typesense logs
```

### Get Typesense Schema

Retrieves and displays the schema for a Typesense collection.

```bash
npm run console:typesense-schema <collection-name>
```

Example:
```bash
npm run console:typesense-schema logs
```

### Search Typesense Collection

Search a Typesense collection with optional query parameters.

```bash
npm run console:search-typesense <collection-name> [query] [query_by]
```

Examples:
```bash
npm run console:search-typesense logs
npm run console:search-typesense logs error
npm run console:search-typesense logs error message
```

## Environment Setup

Make sure your `.env` file is properly configured with the necessary credentials:

### Firestore
```env
GOOGLE_CLOUD_PROJECT=your-project-id
FIRESTORE_PROJECT_ID=your-project-id
FIRESTORE_EMULATOR_HOST=localhost:8080  # Optional, for local development
```

### Typesense
```env
TYPESENSE_API_KEY=your-api-key
TYPESENSE_HOST=localhost  # or your production host
PROD_TYPESENSE_API_KEY=your-prod-api-key  # For production
PROD_TYPESENSE_HOST=your-prod-host  # For production
```

## Running in Production

To run these scripts against production data, set `NODE_ENV=production`:

```bash
NODE_ENV=production npm run console:list-collections
NODE_ENV=production npm run console:drop-typesense logs
```

## Safety Notes

- Always backup your data before running destructive operations
- The `drop-collection` script includes a confirmation prompt to prevent accidental deletions
- Use the `--yes` flag with caution in automated scripts
- Test commands on development/staging environments first
- Review the document counts before confirming deletions

