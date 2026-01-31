import { database, deleteBook, insertBook } from './src/server/db.js';
import { scan, process as processBooks } from './src/server/utilities/missing_books.js';

const FAKE = 'X:\\debug_ghost.pdf';

try {
    console.log('1. Cleaning up...');
    try { deleteBook(FAKE); } catch(e) {}

    console.log('2. Inserting...');
    const insert = database.prepare('INSERT OR IGNORE INTO books (filepath, title) VALUES (?, ?)');
    insert.run(FAKE, 'Debug Ghost');
    
    console.log('3. Scanning...');
    const result = await scan();
    console.log('Scan result count:', result.length);
    const found = result.find(x => x.filepath === FAKE);
    
    if (found) {
        console.log('Found ghost in scan. Reason:', found.reason);
    } else {
        console.log('Ghost NOT found in scan! Scan checks fs.existsSync. Does file exist?', require('fs').existsSync(FAKE));
    }

    console.log('4. Processing deletion...');
    const procResult = await processBooks([FAKE]);
    console.log('Process result:', procResult);

    console.log('5. verifying...');
    const check = database.prepare('SELECT * FROM books WHERE filepath = ?').get(FAKE);
    console.log('In DB:', !!check);

} catch (e) {
    console.error('CRASH:', e);
}
