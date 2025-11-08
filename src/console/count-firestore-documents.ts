import dotenv from 'dotenv';
dotenv.config();

import { connectToFirestore } from '../database/firestore.connection';

async function countFirestoreDocuments() {
    const collectionName = process.argv[2];

    if (!collectionName) {
        console.error('Error: Collection name is required');
        console.log('Usage: ts-node src/console/count-firestore-documents.ts <collection-name>');
        process.exit(1);
    }

    // Connect to Firestore
    const db = await connectToFirestore();
    const collection = db.collection(collectionName);

    console.log(`\n📊 Counting documents in collection '${collectionName}'...\n`);

    // Get document count
    const snapshot = await collection.count().get();
    const documentCount = snapshot.data().count;

    console.log(`✅ Total documents: ${documentCount}\n`);

    // Optionally show a sample document
    if (documentCount > 0) {
        const sampleDoc = await collection.limit(1).get();
        if (!sampleDoc.empty) {
            const doc = sampleDoc.docs[0];
            console.log('📄 Sample document:');
            console.log(`   ID: ${doc.id}`);
            console.log(`   Data: ${JSON.stringify(doc.data(), null, 2)}\n`);
        }
    }
}

countFirestoreDocuments()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Error counting documents:', error);
        process.exit(1);
    });

