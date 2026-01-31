
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.resolve('library.db');
const db = new Database(dbPath);

const TAXONOMY_FILE = path.resolve('taxonomy.json');

function normalizeTag(tag) {
    return tag.toLowerCase()
        .replace(/[\s_]+/g, '-')     // generic separators to hyphen
        .replace(/[^a-z0-9\-\.]/g, '') // remove special chars except dots (for .net)
        .replace(/^-+|-+$/g, '');    // trim hyphens
}

function getUniqueSubTags() {
    const books = db.prepare('SELECT tags FROM books WHERE tags IS NOT NULL').all();
    const tags = new Set();
    books.forEach(book => {
        if (book.tags) {
            book.tags.split(',').forEach(t => tags.add(t.trim()));
        }
    });
    return Array.from(tags).sort();
}

function getStoredMapping() {
    if (!fs.existsSync(TAXONOMY_FILE)) return {};
    return JSON.parse(fs.readFileSync(TAXONOMY_FILE, 'utf8'));
}

console.log('--- START DEBUG ---');
const uniqueTags = getUniqueSubTags();
console.log(`Total Unique DB Tags: ${uniqueTags.length}`);

const existingMapping = getStoredMapping();
const existingKeys = Object.keys(existingMapping);
console.log(`Total Taxonomy Keys: ${existingKeys.length}`);

const normalizedExistingTags = new Set();
existingKeys.forEach(key => {
    normalizedExistingTags.add(normalizeTag(key));
});

console.log(`Normalized Existing Keys: ${normalizedExistingTags.size}`);

const newTags = uniqueTags.filter(tag => {
    const norm = normalizeTag(tag);
    if (!norm) return false; // Skip empty
    const exists = normalizedExistingTags.has(norm);
    
    // Debug specific failure
    // if (!exists && newTags.length < 5) { ... } // Removed to avoid ReferenceError
    return !exists;
});

console.log(`New Tags Detected: ${newTags.length}`);

    newTags.slice(0, 20).forEach(tag => {
        const norm = normalizeTag(tag);
        const inSet = normalizedExistingTags.has(norm);
        console.log(`MISSING: "${tag}" (Normalized: "${norm}")`);
    });
console.log('--- END DEBUG ---');
