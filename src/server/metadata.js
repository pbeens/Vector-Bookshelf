import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { EPub } = require('epub2');
const { PDFParse } = require('pdf-parse');

/**
 * Extract metadata from a file.
 * Returns { title, author, year } or null if failed.
 */

/**
 * Clean up filename for use as title
 */
function cleanFilename(filepath) {
    return path.basename(filepath, path.extname(filepath))
        .replace(/_/g, ' ')  // Replace underscores with spaces
        .trim();
}

/**
 * Clean up author names by removing escape characters and normalizing whitespace
 */
function cleanAuthor(author) {
    if (!author || author === 'Unknown') return author;
    return author
        .replace(/\\/g, '')  // Remove backslashes
        .replace(/\s+/g, ' ')  // Normalize multiple spaces to single space
        .trim();
}

const TIMEOUT_MS = 5000; // 5 seconds max per file

/**
 * Heuristic to detect if a title is "junk" (generic software name, URL, etc.)
 */
function isJunkTitle(title, filename) {
    if (!title) return true;
    const t = title.toLowerCase().trim();
    if (t === '') return true;
    
    // Generic software placeholders
    const junkPatterns = [
        'microsoft word',
        'untitled',
        'latex with hyperref',
        'adobe acrobat',
        'calibre',
        'writer'
    ];
    if (junkPatterns.some(pattern => t.includes(pattern))) return true;
    
    // URLs/Domains (e.g., ebookshelve.top)
    if (/\.[a-z]{2,6}$/.test(t)) return true; 
    if (t.includes('http') || t.includes('www.')) return true;
    
    // If it's exactly the same as the extension, it's junk
    if (t === '.pdf' || t === '.epub') return true;

    return false;
}

function withTimeout(promise, filepath) {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout extracting ${filepath}`)), TIMEOUT_MS)
        )
    ]);
}

export async function extractMetadata(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  
  try {
    // 1. Check file size first to prevent OOM
    const stats = await fs.promises.stat(filepath);
    const fileSizeInBytes = stats.size;
    const MAX_SIZE = 150 * 1024 * 1024; // 150MB Limit

    if (fileSizeInBytes > MAX_SIZE) {
        console.warn(`[Metadata] Skipping ${path.basename(filepath)} - File too large (${(fileSizeInBytes / 1024 / 1024).toFixed(2)}MB)`);
        return {
            title: cleanFilename(filepath),
            author: 'Unknown',
            publication_year: null
        };
    }

    let result = null;
    if (ext === '.epub') {
      result = await withTimeout(extractEpub(filepath), filepath);
    } else if (ext === '.pdf') {
      result = await withTimeout(extractPdf(filepath), filepath);
    }

    if (result) {
        // Apply heuristics
        if (isJunkTitle(result.title, path.basename(filepath))) {
            console.log(`[Metadata] Junk title detected ("${result.title}"). Falling back to filename.`);
            result.title = cleanFilename(filepath);
        }
        console.log(`[Metadata] Final Title for ${path.basename(filepath)}:`, result.title);
        return result;
    }
  } catch (error) {
    console.error(`[Metadata] Failed/Timed out for ${path.basename(filepath)}:`, error.message);
    return {
        title: cleanFilename(filepath),
        author: 'Unknown',
        publication_year: null
    };
  }
  return null;
}

async function extractEpub(filepath) {
  try {
      const epub = await EPub.createAsync(filepath);
      const meta = epub.metadata;
      
      console.log(`[Metadata] Raw EPUB Meta for ${path.basename(filepath)}:`, JSON.stringify(meta));
      
      let year = null;
      if (meta.date) {
          const match = meta.date.match(/(\d{4})/);
          if (match) year = parseInt(match[1]);
      }

      return {
          title: meta.title || cleanFilename(filepath),
          author: cleanAuthor(meta.creator || meta.creatorFileAs || 'Unknown'),
          publication_year: year
      };
  } catch (err) {
      console.error("EPUB Parse Error:", err);
      return null;
  }
}

async function extractPdf(filepath) {
  try {
    const dataBuffer = await fs.promises.readFile(filepath);
    const parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getInfo();
    
    const info = result.info || {};
    console.log(`[Metadata] Raw PDF Info for ${path.basename(filepath)}:`, JSON.stringify(info));
    
    let year = null;
    if (info.CreationDate) {
        const dateStr = info.CreationDate instanceof Date ? info.CreationDate.getFullYear().toString() : info.CreationDate.toString();
        const match = dateStr.match(/(\d{4})/);
        if (match) year = parseInt(match[1]);
    } else if (info.ModDate) {
         const dateStr = info.ModDate instanceof Date ? info.ModDate.getFullYear().toString() : info.ModDate.toString();
         const match = dateStr.match(/(\d{4})/);
        if (match) year = parseInt(match[1]);
    }

    let title = info.Title && info.Title.trim() !== '' ? info.Title : cleanFilename(filepath);
    
    return {
        title,
        author: cleanAuthor(info.Author || 'Unknown'),
        publication_year: year
    };
  } catch (error) {
      console.error(`[Metadata] PDF Parse Error for ${filepath}:`, error.message);
      return {
          title: cleanFilename(filepath),
          author: 'Unknown',
          publication_year: null
      };
  }
}
