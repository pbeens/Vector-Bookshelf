import { initDB, getAllBooks } from './src/server/db.js';

initDB();
const books = getAllBooks();
console.log(`Found ${books.length} books in DB.`);
if (books.length > 0) {
    console.log('Sample book:', books[0]);
}
