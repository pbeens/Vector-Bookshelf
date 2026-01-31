import fs from 'fs';
import { database, deleteBook } from '../db.js';

export const metadata = {
    id: 'missing-books',
    name: 'Missing Book Cleaner',
    description: 'Scans the database for books that are no longer found in the file system.',
    actions: [
        { id: 'scan', label: 'Scan for Missing Books', type: 'scan' },
        { id: 'process', label: 'Remove Selected Books', type: 'execute', destructive: true }
    ]
};

/**
 * Scans for books in the DB that do not exist on disk.
 */
/**
 * Scans for books in the DB that do not exist on disk.
 * @param {object} args - { onProgress: (stats) => void }
 */
export async function scan(args = {}) {
    const { onProgress } = args;
    const books = database.prepare('SELECT filepath FROM books').all();
    const missing = [];
    const total = books.length;

    for (let i = 0; i < total; i++) {
        const book = books[i];
        
        if (!fs.existsSync(book.filepath)) {
            missing.push({
                filepath: book.filepath,
                reason: 'File not found on disk'
            });
        }

        if (onProgress && i % 50 === 0) {
            onProgress({ processed: i + 1, total, current: book.filepath });
        }
    }
    
    // Final progress update
    if (onProgress) {
        onProgress({ processed: total, total, current: 'Complete' });
    }

    return missing;
}

/**
 * Deletes the specified books from the database.
 * @param {Array<string>} filepaths 
 */
export async function process(filepaths) {
    const results = {
        success: [],
        failed: []
    };

    for (const filepath of filepaths) {
        try {
            if (deleteBook(filepath)) {
                results.success.push(filepath);
            } else {
                results.failed.push({ filepath, error: 'Database delete failed (not found?)' });
            }
        } catch (e) {
            results.failed.push({ filepath, error: e.message });
        }
    }

    return results;
}
