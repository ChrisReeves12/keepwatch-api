import dotenv from 'dotenv';
dotenv.config();

import { connectToFirestore } from '../database/firestore.connection';

async function listFirestoreCollections() {
    // Connect to Firestore
    const db = await connectToFirestore();

    console.log('\n📚 Listing all Firestore collections...\n');

    // Get all collections
    const collections = await db.listCollections();

    if (collections.length === 0) {
        console.log('No collections found in the database.');
        return;
    }

    console.log('Collections:');
    console.log('─'.repeat(80));

    // Get document count for each collection
    for (const collection of collections) {
        const countSnapshot = await collection.count().get();
        const count = countSnapshot.data().count;
        console.log(`  📁 ${collection.id.padEnd(30)} (${count} documents)`);
    }

    console.log('─'.repeat(80));
    console.log(`\n✅ Total collections: ${collections.length}\n`);
}

listFirestoreCollections()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Error listing collections:', error);
        process.exit(1);
    });

