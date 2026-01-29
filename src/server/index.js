import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { initDB, getAllBooks, getBooksNeedingMetadata, updateBookMetadata, getBooksNeedingContent, updateBookContent, updateMasterTags, updateBookManualMetadata } from './db.js';
import { scanDirectory } from './scanner.js';
import { extractMetadata } from './metadata.js';
import { processBookContent } from './tagger.js';
import { syncAdaptiveTaxonomy, computeMasterTags } from './taxonomy.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Initialize DB on startup
initDB();

// Global State for robustness
let currentProcessingFile = null;

// ... (rest of the listeners and endpoints follow)

// Prevent server crash on bad books
process.on('uncaughtException', (err) => {
    console.error('CRITICAL: Uncaught Exception:', err);
    if (currentProcessingFile) {
        console.error('Failed on file:', currentProcessingFile);
        // Could mark it as bad in DB here?
        // But simply logging allows us to continue if we restart or ignores it?
        // Actually, if we are in the loop, the loop stack is gone. Server state might be corrupted.
        // But for this simple app, preventing exit is key.
    }
    // Don't exit
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
    if (currentProcessingFile) {
        console.error('Failed on file:', currentProcessingFile);
    }
});

// Get all books
app.get('/api/books', (req, res) => {
  try {
    const books = getAllBooks();
    res.json(books);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process a Single Book Metadata on Demand
app.post('/api/scan-metadata-single', async (req, res) => {
    const { filepath } = req.body;
    if (!filepath) {
        return res.status(400).json({ error: 'Filepath is required' });
    }

    try {
        console.log(`[MetadataSingle] Processing: ${path.basename(filepath)}`);
        const metadata = await extractMetadata(filepath);
        if (metadata) {
            updateBookMetadata(filepath, metadata);
            res.json({ success: true, ...metadata });
        } else {
            res.status(500).json({ error: 'Failed to extract library properties' });
        }
    } catch (err) {
        console.error(`[MetadataSingle] Error:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

// Process a Single Book on Demand (AI Tags)
app.post('/api/scan-single', async (req, res) => {
    const { filepath } = req.body;
    if (!filepath) {
        return res.status(400).json({ error: 'Filepath is required' });
    }

    try {
        console.log(`[SingleScan] Processing: ${path.basename(filepath)}`);
        const contentData = await processBookContent(filepath);
        
        if (contentData) {
            updateBookContent(filepath, contentData);
            
            // Auto-apply Master Tags
            const masterTags = computeMasterTags(contentData.tags);
            if (masterTags) {
                updateMasterTags(filepath, masterTags);
            }
            
            res.json({ success: true, ...contentData, master_tags: masterTags });
        } else {
            res.status(500).json({ error: 'Failed to generate AI content' });
        }
    } catch (err) {
        console.error(`[SingleScan] Error:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

// Open file location in Explorer
app.post('/api/open-folder', async (req, res) => {
  console.log('[Open Folder] ===== ENDPOINT HIT =====');
  console.log('[Open Folder] Request body:', req.body);
  console.log('[Open Folder] Request headers:', req.headers);
  
  const { filepath } = req.body;
  
  if (!filepath) {
    console.log('[Open Folder] ERROR: No filepath provided');
    return res.status(400).json({ error: 'Filepath is required' });
  }

  console.log('[Open Folder] Filepath received:', filepath);

  try {
    const command = `explorer /select,"${filepath}"`;
    console.log('[Open Folder] Executing:', command);
    
    // Fire and forget - explorer.exe returns non-zero exit codes even on success
    exec(command, (error) => {
      if (error) {
        console.log('[Open Folder] Explorer command completed (exit code may be non-zero, but folder likely opened)');
      } else {
        console.log('[Open Folder] Explorer opened successfully');
      }
    });
    
    // Send success immediately - don't wait for explorer
    res.json({ success: true });
  } catch (error) {
    console.error('[Open Folder] catch error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Bulk Export Books
app.post('/api/books/export', async (req, res) => {
    const { filepaths, destination } = req.body;
    
    if (!filepaths || !Array.isArray(filepaths) || !destination) {
        return res.status(400).json({ error: 'filepaths (array) and destination (string) are required' });
    }

    try {
        // Create destination directory if it doesn't exist
        if (!fs.existsSync(destination)) {
            fs.mkdirSync(destination, { recursive: true });
        }

        const results = {
            success: [],
            failed: []
        };

        for (const filepath of filepaths) {
            try {
                const filename = path.basename(filepath);
                const destPath = path.join(destination, filename);
                fs.copyFileSync(filepath, destPath);
                results.success.push(filename);
            } catch (err) {
                console.error(`[Export] Failed to copy ${filepath}:`, err.message);
                results.failed.push({ file: path.basename(filepath), error: err.message });
            }
        }

        res.json({
            message: `Export complete. ${results.success.length} succeeded, ${results.failed.length} failed.`,
            ...results
        });

    } catch (err) {
        console.error('[Export] Critical Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Rescan Master Tags (Adaptive AI Taxonomy) via SSE
app.post('/api/scan-master-tags', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const result = await syncAdaptiveTaxonomy((progress) => {
            try {
                res.write(`data: ${JSON.stringify(progress)}\n\n`);
            } catch (ignore) {}
        });
        
        if (result.success) {
            res.write(`data: ${JSON.stringify({ type: 'complete', count: result.count })}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify({ type: 'error', message: result.message })}\n\n`);
        }
        res.end();
    } catch (err) {
        console.error('[MasterTags] Error:', err.message);
        try {
            res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
            res.end();
        } catch (ignore) {}
    }
});

// Manual Metadata Update
app.post('/api/books/update', async (req, res) => {
    const { id, field, value } = req.body;
    
    if (!id || !field || value === undefined) {
        return res.status(400).json({ error: 'id, field, and value are required' });
    }

    try {
        console.log(`[ManualUpdate] Book ${id}: ${field} -> ${value}`);
        updateBookManualMetadata(id, field, value);
        res.json({ success: true });
    } catch (err) {
        console.error('[ManualUpdate] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Start scan
app.post('/api/scan', async (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath) {
    return res.status(400).json({ error: 'Path is required' });
  }

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    await scanDirectory(dirPath, (stats) => {
      res.write(`data: ${JSON.stringify(stats)}\n\n`);
    });
    
    res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Scan failed:', error);
    try {
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
    } catch (e) {}
  }
});

// Process Metadata
app.post('/api/books/process-metadata', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const books = getBooksNeedingMetadata();
    const total = books.length;
    let processed = 0;
    
    console.log(`[MetadataJob] Starting batch for ${total} books`);

    try {
        res.write(`data: ${JSON.stringify({ type: 'start', total })}\n\n`);
    } catch (e) {
        console.error('[MetadataJob] Failed to write start', e);
    }

    for (const book of books) {
        currentProcessingFile = book.filepath;
        const basename = path.basename(book.filepath);
        try {
            const metadata = await extractMetadata(book.filepath);
            
            if (metadata) {
                console.log(`[MetadataJob] Success: ${basename} ->`, metadata.title);
                updateBookMetadata(book.filepath, metadata);
            } else {
                console.warn(`[MetadataJob] No metadata found for: ${basename}`);
            }
            
            processed++;
            
            try {
                res.write(`data: ${JSON.stringify({ 
                    type: 'progress', 
                    processed, 
                    total, 
                    current: basename,
                    metadata 
                })}\n\n`);
            } catch (writeErr) { }

        } catch (e) {
            console.error(`[MetadataJob] Error processing ${basename}:`, e);
        }
    }
    
    currentProcessingFile = null;
    console.log('[MetadataJob] Batch Complete');
    try {
        res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
        res.end();
    } catch (e) { }
});

// Process Content/Tags (Phase 3)
app.post('/api/books/process-content', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const books = getBooksNeedingContent();
    const total = books.length;
    let processed = 0;
    
    console.log(`[TaggerJob] Starting batch for ${total} books`);

    try {
        res.write(`data: ${JSON.stringify({ type: 'start', total })}\n\n`);
    } catch (e) {
        console.error('[TaggerJob] Failed to write start', e);
    }

    for (const book of books) {
        currentProcessingFile = book.filepath;
        const basename = path.basename(book.filepath);
        try {
            const contentData = await processBookContent(book.filepath);
            
            if (contentData) {
                console.log(`[TaggerJob] Success: ${basename} -> Tags: ${contentData.tags}`);
                updateBookContent(book.filepath, contentData);
                
                // Auto-apply Master Tags
                const masterTags = computeMasterTags(contentData.tags);
                if (masterTags) {
                    updateMasterTags(book.filepath, masterTags);
                }
            } else {
                console.warn(`[TaggerJob] No content data generated for: ${basename}`);
                updateBookContent(book.filepath, { tags: '', summary: '' });
            }
            
            processed++;
            
            try {
                res.write(`data: ${JSON.stringify({ 
                    type: 'progress', 
                    processed, 
                    total, 
                    current: basename,
                    tags: contentData ? contentData.tags : ''
                })}\n\n`);
            } catch (writeErr) { }

        } catch (e) {
            console.error(`[TaggerJob] Error processing ${basename}:`, e);
        }
    }
    
    currentProcessingFile = null;
    console.log('[TaggerJob] Batch Complete');
    
    try {
        res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
        res.end();
    } catch (e) { }
});

// Reset failed AI scans (books marked as scanned but have no tags)
app.post('/api/books/reset-failed-scans', (req, res) => {
    try {
        const stmt = database.prepare(`
            UPDATE books 
            SET content_scanned = 0 
            WHERE (tags IS NULL OR tags = '') AND metadata_scanned = 1
        `);
        const result = stmt.run();
        console.log(`[ResetScans] Reset ${result.changes} books`);
        res.json({ success: true, count: result.changes });
    } catch (err) {
        console.error('[ResetScans] Error:', err);
        res.status(500).json({ error: err.message });
    }
});


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
