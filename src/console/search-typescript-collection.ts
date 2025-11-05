import dotenv from 'dotenv';
dotenv.config();

import { getTypesenseClient } from '../services/typesense.service';

const typesenseClient = getTypesenseClient(
    process.env.NODE_ENV === 'production' ? process.env.PROD_TYPESENSE_API_KEY : process.env.TYPESENSE_API_KEY,
    process.env.NODE_ENV === 'production' ? process.env.PROD_TYPESENSE_HOST : 'localhost'
);

async function searchTypesenseCollection() {
    const collectionName = process.argv[2];
    const query = process.argv[3];

    if (!collectionName) {
        console.error('Error: Collection name is required');
        console.log('Usage: ts-node src/console/search-typesense-collection.ts <collection-name> [query]');
        process.exit(1);
    }

    const searchParameters = {
        q: query || '*',
        sort_by: 'timestampMS:desc',
        per_page: 50,
        page: 1,
        query_by: process.argv[4] || '*'
    };

    const searchResults = await typesenseClient.collections(collectionName).documents().search(searchParameters);
    console.log(JSON.stringify(searchResults, null, 2));
}

searchTypesenseCollection();