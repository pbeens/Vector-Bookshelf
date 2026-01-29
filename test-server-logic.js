import { initDB, getBooksNeedingMetadata, updateBookMetadata } from './src/server/db.js';
import { extractMetadata } from './src/server/metadata.js';
import path from 'path';

initDB();

async function run() {
    const books = getBooksNeedingMetadata();
    console.log(`Processing ${books.length} books...`);

    // Process first 5 only for test
    const subset = books.slice(0, 5);
    
    for (const book of subset) {
        console.log(`Extracting for: ${path.basename(book.filepath)}`);
        try {
            const metadata = await extractMetadata(book.filepath);
            console.log('Got metadata:', metadata);
            if (metadata) {
                // updateBookMetadata(book.filepath, metadata); // Don't actually write to DB yet? No, write it.
                console.log('Would update DB here');
            } else {
                console.log('Metadata was null');
            }
        } catch (e) {
            console.error('Loop error:', e);
        }
    }
}

run();
