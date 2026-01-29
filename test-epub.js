
import { extractMetadata } from './src/server/metadata.js';
import path from 'path';

// Construct path carefully
// Note: Hardcoding the path I saw in snippet 
// D:\My Documents\Downloads\_qBittorrent\Destroyed Twitter by Kate Conger.epub
// (Actually I'll try to just paste what I think it describes, or better, query DB again and take the string directly)

// Let's just use the function on a path I construct dynamically to be safe
import { initDB, getAllBooks } from './src/server/db.js';

initDB();
const books = getAllBooks();
const book = books.find(b => b.filepath.endsWith('.epub'));

if (book) {
    console.log(`Testing on: ${book.filepath}`);
    extractMetadata(book.filepath).then(res => {
        console.log("Result:", res);
    }).catch(err => {
        console.error("Error:", err);
    });
} else {
    console.log("No EPUB found in DB to test.");
}
