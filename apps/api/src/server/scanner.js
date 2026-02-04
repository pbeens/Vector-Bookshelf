import fs from 'fs/promises';
import path from 'path';
import { insertBook, updateBookMetadata } from './db.js';
import { extractMetadata } from './metadata.js';

async function getFiles(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  }));
  return Array.prototype.concat(...files);
}

export async function scanDirectory(dirPath, onProgress) {
  let stats = {
    found: 0,
    added: 0,
    skipped: 0,
    metadataExtracted: 0,
    metadataFailed: 0,
    currentFile: ''
  };

  try {
    async function* walk(dir) {
        const files = await fs.readdir(dir, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            if (file.isDirectory()) {
                yield* walk(fullPath);
            } else {
                yield fullPath;
            }
        }
    }

    for await (const file of walk(dirPath)) {
        const ext = path.extname(file).toLowerCase();
        if (ext === '.epub' || ext === '.pdf') {
            stats.found++;
            stats.currentFile = path.basename(file);
            
            // Insert book into database
            const inserted = insertBook(file);
            
            if (inserted) {
                stats.added++;
                
                // Extract metadata immediately after insertion
                try {
                    const metadata = await extractMetadata(file);
                    if (metadata) {
                        updateBookMetadata(file, metadata);
                        stats.metadataExtracted++;
                        console.log(`[Scanner] Metadata extracted for: ${path.basename(file)}`);
                    } else {
                        stats.metadataFailed++;
                        console.warn(`[Scanner] No metadata found for: ${path.basename(file)}`);
                    }
                } catch (error) {
                    stats.metadataFailed++;
                    console.error(`[Scanner] Metadata extraction failed for ${path.basename(file)}:`, error.message);
                }
            } else {
                stats.skipped++;
            }

            // Report progress after each file
            onProgress({ type: 'progress', ...stats });
        }
    }

  } catch (error) {
    throw error;
  }
}
