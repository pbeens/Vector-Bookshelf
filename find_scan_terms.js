import Database from 'better-sqlite3';
const db = new Database('library.db');

const unscanned = db.prepare("SELECT filepath, title, author FROM books WHERE content_scanned = 0").all();

const wordFreq = {};
const stopWords = new Set(['the', 'and', 'a', 'to', 'of', 'in', 'is', 'it', 'with', 'for', 'by', 'on', 'at', 'an', 'this', 'that', 'epub', 'calibre', 'library', 'books', 'documents', 'users', 'peter', 'unknown', 'book', 'various', 'pdf', 'mobi', 'azw3']);

unscanned.forEach(book => {
    const text = `${book.title || ''} ${book.author || ''} ${book.filepath || ''}`.toLowerCase();
    const words = text.split(/[^a-z0-9]/);
    words.forEach(word => {
        if (word.length > 3 && !stopWords.has(word)) {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
    });
});

const sorted = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]);
console.log("Top unscanned terms:");
sorted.slice(0, 10).forEach(([word, count]) => {
    console.log(`${word}: ${count}`);
});
