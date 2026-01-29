import { initDB, getAllBooks } from './src/server/db.js';
import { extractMetadata } from './src/server/metadata.js';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { EPub } = require('epub2');
const pdf = require('pdf-parse');

initDB();
const books = getAllBooks();
console.log(`Found ${books.length} books.`);

if (books.length > 0) {
    const book = books[0];
    console.log(`Inspecting: ${book.filepath}`);
    
    inspect(book.filepath);
} else {
    console.log("No books to inspect. Scan a folder first.");
}

async function inspect(filepath) {
    const ext = path.extname(filepath).toLowerCase();
    
    if (ext === '.epub') {
        try {
            const epub = await EPub.createAsync(filepath);
            console.log("RAW EPUB METADATA:", JSON.stringify(epub.metadata, null, 2));
        } catch (e) {
            console.error("EPUB Error:", e);
        }
    } else if (ext === '.pdf') {
        try {
            console.log('PDF Export Type:', typeof pdf);
            console.log('PDF Export Keys:', Object.keys(pdf));
            const dataBuffer = await fs.promises.readFile(filepath);
            // If it's an object with default, use default
            const parser = pdf.default || pdf;
            const data = await parser(dataBuffer);
            
            console.log("RAW PDF INFO:", JSON.stringify(data.info, null, 2));
            console.log("RAW PDF METADATA:", JSON.stringify(data.metadata, null, 2));
        } catch (e) {
             console.error("PDF Error:", e);
        }
    }
}
