import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve('library.db');
const db = new Database(dbPath);

// Enable WAL mode for robustness against crashes
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

/**
 * Initialize the database schema
 */
export function initDB() {
  const createBooksTable = `
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filepath TEXT UNIQUE NOT NULL,
      title TEXT,
      author TEXT,
      publication_year INTEGER,
      tags TEXT,
      summary TEXT,
      master_tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      metadata_scanned BOOLEAN DEFAULT 0,
      content_scanned BOOLEAN DEFAULT 0
    );
  `;
  
  db.exec(createBooksTable);
  
  // Migration: Add master_tags if it doesn't exist
  try {
    db.exec('ALTER TABLE books ADD COLUMN master_tags TEXT');
    console.log('Migration: Added master_tags column to books table');
  } catch (e) {
    // Column already exists, ignore
  }

  console.log('Database initialized at', dbPath);
  
  // Migration: Add locked_fields if it doesn't exist
  try {
    db.exec("ALTER TABLE books ADD COLUMN locked_fields TEXT DEFAULT '[]'");
    console.log('Migration: Added locked_fields column to books table');
  } catch (e) {
    // Column already exists
  }
}

/**
 * Insert a book if it doesn't exist.
 * Returns true if inserted, false if skipped (already exists).
 */
export function insertBook(filepath) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO books (filepath) VALUES (?)
  `);
  
  const info = insert.run(filepath);
  // info.changes is 1 if inserted, 0 if ignored
  return info.changes > 0;
}

/**
 * Get all books with optional search and filters.
 * @param {string} [search] - Text to search in title, author, or tags
 * @param {object} [filters] - { yearStart, yearEnd }
 */
export function getAllBooks(search, filters = {}) {
  let query = 'SELECT * FROM books';
  const params = [];
  const conditions = [];

  // Search (Title, Author, Tags)
  if (search && search.trim()) {
    const likeQuery = `%${search.trim()}%`;
    conditions.push('(title LIKE ? OR author LIKE ? OR tags LIKE ?)');
    params.push(likeQuery, likeQuery, likeQuery);
  }

  // Year Range
  if (filters.yearStart) {
    conditions.push('publication_year >= ?');
    params.push(filters.yearStart);
  }
  if (filters.yearEnd) {
    conditions.push('publication_year <= ?');
    params.push(filters.yearEnd);
  }

  // Combine conditions
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  return db.prepare(query).all(...params);
}

export function updateBookMetadata(filepath, { title, author, publication_year }) {
  // Check for locked fields first
  const book = db.prepare('SELECT locked_fields FROM books WHERE filepath = ?').get(filepath);
  let locked = [];
  try {
    locked = JSON.parse(book?.locked_fields || '[]');
  } catch (e) {}

  // Construct dynamic update query based on unlocked fields
  const updates = [];
  const params = [];

  if (!locked.includes('title')) {
    updates.push('title = ?');
    params.push(title);
  }
  if (!locked.includes('author')) {
    updates.push('author = ?');
    params.push(author);
  }
  // Years typically aren't manually edited effectively yet, but let's be consistent
  updates.push('publication_year = ?'); 
  params.push(publication_year);

  // Always mark scanned
  updates.push('metadata_scanned = 1');

  if (updates.length > 0) {
    const query = `UPDATE books SET ${updates.join(', ')} WHERE filepath = ?`;
    db.prepare(query).run(...params, filepath);
  }
}

export function updateBookContent(filepath, { tags, summary }) {
  const update = db.prepare(`
    UPDATE books 
    SET tags = ?, summary = ?, content_scanned = 1
    WHERE filepath = ?
  `);
  update.run(tags, summary, filepath);
}

export function updateMasterTags(filepath, masterTags) {
  const update = db.prepare(`
    UPDATE books 
    SET master_tags = ?
    WHERE filepath = ?
  `);
  update.run(masterTags, filepath);
}

export function updateBookTags(filepath, tags) {
  const update = db.prepare(`
    UPDATE books 
    SET tags = ?
    WHERE filepath = ?
  `);
  update.run(tags, filepath);
}

// Export db instance for transactions
export const database = db;

/**
 * Executes a function within a transaction
 */
export const runTransaction = (fn) => {
  const transaction = db.transaction(fn);
  return transaction();
};

/**
 * Manually update a specific field for a book
 */
export function updateBookManualMetadata(id, field, value) {
  // Allowlist fields for safety
  const allowedFields = ['title', 'author'];
  if (!allowedFields.includes(field)) {
    throw new Error(`Invalid field: ${field}`);
  }

  const update = db.prepare(`UPDATE books SET ${field} = ? WHERE id = ?`);
  update.run(value, id);

  // Lock this field so it isn't overwritten by auto-scan
  const book = db.prepare('SELECT locked_fields FROM books WHERE id = ?').get(id);
  let locked = [];
  try {
    locked = JSON.parse(book?.locked_fields || '[]');
  } catch (e) {}

  if (!locked.includes(field)) {
    locked.push(field);
    db.prepare('UPDATE books SET locked_fields = ? WHERE id = ?').run(JSON.stringify(locked), id);
  }
}

export function getBooksNeedingMetadata() {
    return db.prepare('SELECT filepath FROM books WHERE metadata_scanned = 0').all();
}

export function getBooksNeedingContent(limit = 50) {
    // Include books that either:
    // 1. Haven't been scanned yet (content_scanned = 0)
    // 2. Were scanned but have no tags (failed scan)
    return db.prepare(`
        SELECT filepath, title 
        FROM books 
        WHERE metadata_scanned = 1 
        AND (content_scanned = 0 OR tags IS NULL OR tags = '')
        LIMIT ?
    `).all(limit);
}

export default db;
