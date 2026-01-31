import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { scan, process as processBooks } from './src/server/utilities/missing_books.js';
import { database } from './src/server/db.js';

// Mock database for testing if needed, but we are importing the real one.
// We will insert a fake book.

const FAKE_BOOK_PATH = 'X:\\fake\\path\\ghost_book.pdf';

console.log('--- Starting Missing Book Cleaner Verification ---');

// 1. Setup: Insert ghost book
console.log('[1] Inserting ghost book...');
try {
    const insert = database.prepare('INSERT OR IGNORE INTO books (filepath, title) VALUES (?, ?)');
    insert.run(FAKE_BOOK_PATH, 'Ghost Book');
    console.log('    Inserted.');
} catch (e) {
    console.error('    Failed to insert:', e);
    process.exit(1);
}

// 2. Scan
console.log('[2] Scanning for missing books...');
async function testScan() {
    const missing = await scan();
    const found = missing.find(m => m.filepath === FAKE_BOOK_PATH);
    
    if (found) {
        console.log('    SUCCESS: Ghost book found in scan results.');
        return true;
    } else {
        console.error('    FAILURE: Ghost book NOT found in scan results.');
        // console.log('Results:', missing);
        return false;
    }
}

// 3. Process
console.log('[3] Processing deletion...');
async function testProcess() {
    const result = await processBooks([FAKE_BOOK_PATH]);
    
    if (result.success.includes(FAKE_BOOK_PATH)) {
        console.log('    SUCCESS: Ghost book reported as deleted.');
    } else {
        console.error('    FAILURE: Ghost book not reported as deleted.');
        console.log('    Result:', result);
        return false;
    }

    // Double check DB
    const check = database.prepare('SELECT * FROM books WHERE filepath = ?').get(FAKE_BOOK_PATH);
    if (!check) {
        console.log('    SUCCESS: Ghost book is gone from DB.');
        return true;
    } else {
        console.error('    FAILURE: Ghost book still exists in DB!');
        return false;
    }
}

(async () => {
    if (await testScan()) {
        await testProcess();
    }
    console.log('--- Verification Complete ---');
})();
