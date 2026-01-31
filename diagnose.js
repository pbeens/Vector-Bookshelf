import { database } from './src/server/db.js';
import fs from 'fs';

const FAKE = 'X:\\debug_ghost.pdf';

console.log('Start Diagnosis');

try {
    // 1. DB Count
    console.log('Checking DB count...');
    const count = database.prepare('SELECT COUNT(*) as c FROM books').get().c;
    console.log(`DB has ${count} books.`);

    // 2. FS Check on FAKE
    console.log('Checking fs.existsSync on FAKE...');
    const exists = fs.existsSync(FAKE);
    console.log(`FAKE exists? ${exists}`);


    // 3. FS Check on REAL (if any)
    if (count > 0) {
        const book = database.prepare('SELECT filepath FROM books LIMIT 1').get();
        console.log(`Checking fs.existsSync on ${book.filepath}...`);
        const realExists = fs.existsSync(book.filepath);
        console.log(`Real exists? ${realExists}`);
    }

    // 4. Verify Delete Logic
    console.log('Verifying Delete...');
    const insert = database.prepare('INSERT OR IGNORE INTO books (filepath, title) VALUES (?, ?)');
    insert.run(FAKE, 'Debug Delete');
    
    // Verify it's there
    let check = database.prepare('SELECT * FROM books WHERE filepath = ?').get(FAKE);
    console.log('Inserted Ghost? ' + !!check);

    const { deleteBook } = await import('./src/server/db.js');
    console.log('Deleting...');
    deleteBook(FAKE);

    check = database.prepare('SELECT * FROM books WHERE filepath = ?').get(FAKE);
    console.log('Ghost gone? ' + !check);

    console.log('Diagnosis Complete');
} catch (e) {
    console.error('Error:', e);
}
