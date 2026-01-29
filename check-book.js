import { initDB, getAllBooks } from './src/server/db.js';
import path from 'path';

initDB();
const books = getAllBooks();
const book = books.find(b => b.filepath.includes('Destroyed Twitter'));

if (book) {
    console.log('Book Metadata:', {
        title: book.title,
        author: book.author,
        year: book.publication_year,
        scanned: book.metadata_scanned
    });
} else {
    console.log('Book not found in DB');
}
