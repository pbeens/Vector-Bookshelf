import { initDB, getBooksNeedingMetadata, getAllBooks } from './src/server/db.js';

initDB();
const needing = getBooksNeedingMetadata();
console.log(`Books needing metadata: ${needing.length}`);

const all = getAllBooks();
console.log(`Total books: ${all.length}`);
if (all.length > 0) {
    console.log('Sample book:', all[0]);
}
