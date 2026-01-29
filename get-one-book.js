import { initDB, getAllBooks } from './src/server/db.js';
initDB();
const books = getAllBooks();
if (books.length > 0) {
    console.log(books[0].filepath);
}
