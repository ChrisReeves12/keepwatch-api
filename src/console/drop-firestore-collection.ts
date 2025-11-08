import dotenv from 'dotenv';
dotenv.config();

import { connectToFirestore } from '../database/firestore.connection';
import * as readline from 'readline';

async function dropFirestoreCollection() {
    const collectionName = process.argv[2];
    const skipConfirmation = process.argv[3] === '--yes' || process.argv[3] === '-y';

    if (!collectionName) {
        console.error('Error: Collection name is required');
        console.log('Usage: ts-node src/console/drop-firestore-collection.ts <collection-name> [--yes]');
        console.log('Options:');
        console.log('  --yes, -y    Skip confirmation prompt');
        process.exit(1);
    }

    // Connect to Firestore
    const db = await connectToFirestore();
    const collection = db.collection(collectionName);

    // Get document count
    const snapshot = await collection.count().get();
    const documentCount = snapshot.data().count;

    if (documentCount === 0) {
        console.log(`✅ Collection '${collectionName}' is already empty (0 documents)`);
        process.exit(0);
    }

    console.log(`\n⚠️  WARNING: You are about to delete collection '${collectionName}'`);
    console.log(`📊 Total documents to be deleted: ${documentCount}`);
    console.log(`🔥 This action cannot be undone!\n`);

    if (!skipConfirmation) {
        const confirmed = await askForConfirmation(`Are you sure you want to delete all ${documentCount} documents from '${collectionName}'? (yes/no): `);
        
        if (!confirmed) {
            console.log('❌ Operation cancelled');
            process.exit(0);
        }
    }

    console.log(`\n🗑️  Starting deletion of collection '${collectionName}'...`);

    // Delete documents in batches (Firestore batch limit is 500)
    const batchSize = 500;
    let deletedCount = 0;

    while (true) {
        // Query documents in batches
        const documentsSnapshot = await collection.limit(batchSize).get();
        
        if (documentsSnapshot.empty) {
            break;
        }

        // Create a batch for deletion
        const batch = db.batch();
        documentsSnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        // Commit the batch
        await batch.commit();
        deletedCount += documentsSnapshot.size;

        console.log(`  Deleted ${deletedCount} / ${documentCount} documents...`);
    }

    console.log(`\n✅ Successfully deleted collection '${collectionName}'`);
    console.log(`📊 Total documents deleted: ${deletedCount}`);
}

/**
 * Ask user for confirmation
 */
function askForConfirmation(question: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            const normalizedAnswer = answer.toLowerCase().trim();
            resolve(normalizedAnswer === 'yes' || normalizedAnswer === 'y');
        });
    });
}

dropFirestoreCollection()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Error dropping collection:', error);
        process.exit(1);
    });

