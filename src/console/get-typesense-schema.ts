import dotenv from 'dotenv';
dotenv.config();

import { getTypesenseClient } from '../services/typesense.service';

const typesenseClient = getTypesenseClient(
    process.env.NODE_ENV === 'production' ? process.env.PROD_TYPESENSE_API_KEY : process.env.TYPESENSE_API_KEY,
    process.env.NODE_ENV === 'production' ? process.env.PROD_TYPESENSE_HOST : 'localhost'
);

async function getTypesenseSchema() {
    const collectionName = process.argv[2];
    
    if (!collectionName) {
        console.error('Error: Collection name is required');
        console.log('Usage: ts-node src/console/get-typesense-schema.ts <collection-name>');
        process.exit(1);
    }
    
    const schema = await typesenseClient.collections(collectionName).retrieve();
    console.log(JSON.stringify(schema, null, 2));
}

getTypesenseSchema();