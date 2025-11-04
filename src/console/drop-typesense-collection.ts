import dotenv from 'dotenv';
dotenv.config();

import { getTypesenseClient } from '../services/typesense.service';

const typesenseClient = getTypesenseClient();

async function dropTypesenseCollection() {
    const collectionName = process.argv[2];
    
    if (!collectionName) {
        console.error('Error: Collection name is required');
        console.log('Usage: ts-node src/console/drop-typesense-collection.ts <collection-name>');
        process.exit(1);
    }
    
    await typesenseClient.collections(collectionName).delete();
    console.log(`Typesense collection '${collectionName}' dropped`);
}

dropTypesenseCollection();