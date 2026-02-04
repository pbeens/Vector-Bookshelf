import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import fetch from 'node-fetch'; // Polyfill for environments where fetch is missing
import { initDB, getAllBooks, getBooksNeedingMetadata, updateBookMetadata, getBooksNeedingContent, updateBookContent, updateMasterTags, updateBookManualMetadata, database } from './db.js';
import { scanDirectory } from './scanner.js';
import { extractMetadata } from './metadata.js';
import { processBookContent, getActiveContextSize } from './tagger.js';
import { syncAdaptiveTaxonomy, computeMasterTags } from './taxonomy.js';
import { getActiveModelPath, loadLLMConfig, saveLLMConfig } from './config.js';
import { RULES_PATH } from './paths.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// LLM Configuration Endpoint
app.get('/api/config/llm', (req, res) => {
    try {
        const config = loadLLMConfig();
        res.json({ success: true, config });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/config/llm', (req, res) => {
    try {
        const newConfig = req.body;
        // Basic validation
        if (!newConfig || typeof newConfig !== 'object') {
            return res.status(400).json({ success: false, error: 'Invalid config' });
        }
        
        // Merge with existing to be safe
        const current = loadLLMConfig();
        const updated = { ...current, ...newConfig };
        
        if (saveLLMConfig(updated)) {
            res.json({ success: true, config: updated });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save config' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Serve Static Frontend (Production)
const frontendPath = path.join(process.cwd(), '../web/dist');
if (fs.existsSync(frontendPath)) {
    console.log(`[Server] Serving static frontend from: ${frontendPath}`);
    app.use(express.static(frontendPath));
} else {
    console.warn(`[Server] Frontend build not found at: ${frontendPath}`);
}

// Initialize DB on startup
initDB();

// Global State for robustness
let currentProcessingFile = null;
let scanState = {
    active: false,
    processed: 0,
    total: 0,
    currentFile: null,
    startTime: null,
    totalTokens: 0
};

// ... (rest of the listeners and endpoints follow)

// Prevent server crash on bad books
// Prevent server crash on bad books
process.on('uncaughtException', (err) => {
    console.error('CRITICAL: Uncaught Exception:', err);
    if (currentProcessingFile) {
        console.error('Failed on file:', currentProcessingFile);
        try {
            // Mark as failed so we don't retry it infinitely
            updateBookContent(currentProcessingFile, { tags: 'Error: Crashed Server', summary: `Crash: ${err.message}` });
            console.log('Marked file as error in DB.');
        } catch (dbErr) {
            console.error('Failed to mark bad file in DB:', dbErr);
        }
    }
    // We ideally should exit, but user wants to try to keep going
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL: Unhandled Rejection:', reason);
    if (currentProcessingFile) {
        console.error('Failed on file:', currentProcessingFile);
        try {
             updateBookContent(currentProcessingFile, { tags: 'Error: Promise Rejection', summary: `Rejection: ${reason}` });
        } catch (e) {}
    }
});

// Check Scan Status
app.get('/api/scan/status', (req, res) => {
    res.json(scanState);
});

// Health check
// Health check (Checks both Backend & AI Server)
app.get('/api/health', async (req, res) => {
    let aiStatus = 'offline';
    let aiName = '';
    let aiDetail = '';

    const modelPath = getActiveModelPath();

    if (modelPath) {
        if (fs.existsSync(modelPath)) {
            aiStatus = 'online';
            aiDetail = 'Embedded (Ready)';
            aiName = path.basename(modelPath);
        } else {
             aiStatus = 'offline';
             aiDetail = 'Embedded (Model Missing)';
        }
    } else {
        aiStatus = 'offline';
        aiDetail = 'Embedded (No Model Selected)';
    }

    res.json({ 
        status: 'ok', 
        timestamp: Date.now(), 
        backend: true, 
        ai: aiStatus === 'online',
        ai_status: aiStatus,
        ai_name: aiName,
        ai_detail: aiDetail,
        ai_context_size: getActiveContextSize() || 0
    });
    return; // Skip old logic
    
    /* Old logic removed */
    const { getCurrentServer } = await import('./config.js');


    if (server.type === 'built_in') {
        // For built-in, "online" means we have a model path configured
        if (server.modelPath && fs.existsSync(server.modelPath)) {
            const modelName = path.basename(server.modelPath);
            aiStatus = 'online';
            aiDetail = 'Embedded (Ready)';
            aiName = modelName;
        } else {
            aiStatus = 'offline';
            aiDetail = 'Embedded (No Model)';
        }
    } else {
        // For external servers, we ping
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000); 
            
            // Note: server.url is usually .../v1/chat/completions, 
            // the base URL is better for health check but we'll try to reach the completions endpoint or models list
            const healthUrl = server.url.replace('/chat/completions', '/models').replace('/completions', '/models');
            
            const aiRes = await fetch(healthUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (aiRes.ok) {
                aiStatus = 'online';
                aiDetail = `${server.name} (Online)`;
            } else {
                aiDetail = `${server.name} (Error ${aiRes.status})`;
            }
        } catch (e) {
            aiDetail = `${server.name} (Offline)`;
        }
    }

    res.json({ 
        status: 'ok', 
        timestamp: Date.now(), 
        backend: true, 
        ai: aiStatus === 'online',
        ai_status: aiStatus,
        ai_name: aiName,
        ai_detail: aiDetail
    });
});

// Get all books (with search)
app.get('/api/books', (req, res) => {
  try {
    const { q, year_start, year_end } = req.query;
    
    // Convert empty strings to undefined/null
    const search = q || '';
    const filters = {
        yearStart: year_start ? parseInt(year_start) : null,
        yearEnd: year_end ? parseInt(year_end) : null
    };

    const books = getAllBooks(search, filters);
    
    // Get total uncensored count for UI "Total books in library" display
    const totalCount = database.prepare('SELECT COUNT(*) as count FROM books').get().count;
    res.set('X-Library-Size', totalCount.toString());
    res.set('Access-Control-Expose-Headers', 'X-Library-Size');

    console.log(`[API] Returning ${books.length} books (Search: "${search}", Years: ${filters.yearStart}-${filters.yearEnd}, Total Lib: ${totalCount})`);
    res.json(books);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint
app.get('/api/debug/count', (req, res) => {
  const books = getAllBooks();
  const count = database.prepare('SELECT COUNT(*) as count FROM books').get();
  res.json({ 
    getAllBooksCount: books.length,
    directCount: count.count,
    sample: books.slice(0, 3).map(b => ({ filepath: b.filepath, title: b.title }))
  });
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
    console.log('[API] /api/books/process-content HIT');
    
    // If scan is already running, reject new request
    if (scanState.active) {
        return res.status(409).json({ error: 'Scan already in progress', status: scanState });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Reset State
    let targetBooks = [];
    let isTargeted = false;
    
    // Parse body for targeted scan (e.g. filtered view)
    // Note: Use a limit for incoming data to prevent massive payloads if needed
    if (req.body && req.body.targetFilepaths && Array.isArray(req.body.targetFilepaths)) {
        isTargeted = true;
        console.log(`[TaggerJob] Targeted scan requested for ${req.body.targetFilepaths.length} files.`);
        
        // Filter DB to find which of these actually NEED scanning
        // We do this in chunks to avoid SQLite variable limits (999)
        const chunks = [];
        for (let i = 0; i < req.body.targetFilepaths.length; i += 900) {
            chunks.push(req.body.targetFilepaths.slice(i, i + 900));
        }
        
        for (const chunk of chunks) {
            const placeholders = chunk.map(() => '?').join(',');
            const rows = database.prepare(`
                SELECT filepath FROM books 
                WHERE filepath IN (${placeholders}) 
                AND (content_scanned = 0 OR tags IS NULL OR tags = '' OR tags LIKE 'Error:%' OR tags LIKE 'Skipped:%')
            `).all(...chunk);
            targetBooks.push(...rows);
        }
        
        scanState.total = targetBooks.length;
    } else {
        // Default: Scan ALL missing
        const allBooks = database.prepare("SELECT COUNT(*) as count FROM books WHERE metadata_scanned = 1 AND (content_scanned = 0 OR tags IS NULL OR tags = '')").get();
        scanState.total = allBooks.count;
    }

    scanState.processed = 0;
    scanState.active = true;
    scanState.startTime = Date.now();
    scanState.totalTokens = 0;
    scanState.currentFile = 'Initializing...';
    
    console.log(`[TaggerJob] Starting processing for ${scanState.total} books (${isTargeted ? 'Targeted' : 'Full Scan'})`);

    try {
        res.write(`data: ${JSON.stringify({ type: 'start', total: scanState.total })}\n\n`);
    } catch (e) {
        console.error('[TaggerJob] Failed to write start', e);
    }

    // Start background processing loop
    (async () => {
        const BATCH_SIZE = 50;
        let keepGoing = true;
        let targetIndex = 0; // For iterating targeted array

        try {
            while (keepGoing && scanState.active) {
                let books = [];
                
                if (isTargeted) {
                    // Pull next batch from header array
                    if (targetIndex >= targetBooks.length) {
                        books = [];
                    } else {
                        const slice = targetBooks.slice(targetIndex, targetIndex + BATCH_SIZE);
                        // We need full book objects or just filepath? 
                        // The loop uses `book.filepath`.
                        books = slice; 
                        targetIndex += BATCH_SIZE;
                    }
                } else {
                    // Pull from DB
                    books = getBooksNeedingContent(BATCH_SIZE);
                }

                if (books.length === 0) {
                    keepGoing = false;
                    break;
                }
                
                console.log(`[TaggerJob] Processing batch of ${books.length} books`);

                for (const book of books) {
                    scanState.currentFile = path.basename(book.filepath);
                    currentProcessingFile = book.filepath;
                    
                    console.log(`[TaggerJob] >>> Starting: ${scanState.currentFile} (${scanState.processed + 1}/${scanState.total})`);
                    let tagsToSend = '';
                    
                    try {
                        const contentData = await processBookContent(book.filepath);
                        
                        if (contentData && !contentData.error) {
                            console.log(`[TaggerJob] Success: ${scanState.currentFile}`);
                            updateBookContent(book.filepath, contentData);
                            tagsToSend = contentData.tags;
                            
                            const masterTags = computeMasterTags(contentData.tags);
                            if (masterTags) updateMasterTags(book.filepath, masterTags);
                            
                            if (contentData.total_tokens) {
                                scanState.totalTokens += contentData.total_tokens;
                            }
                        } else if (contentData && contentData.error) {
                            console.warn(`[TaggerJob] AI Error for: ${scanState.currentFile} - ${contentData.error}`);
                            updateBookContent(book.filepath, { tags: `Error: ${contentData.error}`, summary: 'AI connection or processing failed.' });
                            tagsToSend = `Error: ${contentData.error}`;
                        } else {
                            console.warn(`[TaggerJob] No content data for: ${scanState.currentFile}`);
                            updateBookContent(book.filepath, { tags: 'Skipped: No Content', summary: 'Insufficient text extracted from file.' });
                            tagsToSend = 'Skipped: No Content';
                        }
                    } catch (e) {
                        console.error(`[TaggerJob] Error processing ${scanState.currentFile}:`, e);
                        updateBookContent(book.filepath, { tags: 'Error: Scan Failed', summary: e.message });
                        tagsToSend = 'Error: Scan Failed';
                    }

                    scanState.processed++;
                    
                    try {
                        res.write(`data: ${JSON.stringify({ 
                            type: 'progress', 
                            processed: scanState.processed, 
                            total: scanState.total, 
                            current: scanState.currentFile,
                            startTime: scanState.startTime,
                            totalTokens: scanState.totalTokens,
                            tags: tagsToSend
                        })}\n\n`);
                    } catch (writeErr) { }
                }
            }
        } catch (err) {
            console.error('[TaggerJob] FATAL LOOP ERROR:', err);
        } finally {
            scanState.active = false;
            scanState.currentFile = null;
            currentProcessingFile = null;
            console.log('[TaggerJob] Job Complete');
            
            try {
                res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
                res.end();
            } catch (e) { }
        }
    })();
});

// Export Errors to File
app.post('/api/scan/stop', (req, res) => {
    if (scanState.active) {
        scanState.active = false; // This breaks the loop
        console.log('[API] Stop requested. Stopping scan loop...');
        res.json({ success: true, message: 'Scan stopping...' });
    } else {
        res.json({ success: false, message: 'No scan active' });
    }
});

app.post('/api/books/export-errors', async (req, res) => {
    try {
        const errors = database.prepare(`
            SELECT filepath, tags, summary FROM books 
            WHERE tags LIKE 'Error:%' OR tags LIKE 'Skipped:%'
        `).all();

        if (errors.length === 0) {
            return res.json({ success: true, count: 0, message: 'No errors found.' });
        }

        // Use stable path from Electron or fallback to process.cwd()
        const baseDir = process.env.USER_DATA_PATH || process.cwd();
        const logsDir = path.join(baseDir, 'logs');
        
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        const reportPath = path.join(logsDir, `scan_errors_${Date.now()}.txt`);
        const reportContent = errors.map(e => {
            return `[${e.tags}] ${path.basename(e.filepath)}\nReason: ${e.summary}\nPath: ${e.filepath}\n----------------------------------------`;
        }).join('\n\n');

        const header = `VECTOR BOOKSHELF - SCAN ERROR REPORT\nGenerated: ${new Date().toLocaleString()}\nTotal Issues: ${errors.length}\n\n`;

        await fs.promises.writeFile(reportPath, header + reportContent, 'utf8');

        console.log(`[API] Exported ${errors.length} errors to ${reportPath}`);
        res.json({ success: true, count: errors.length, path: reportPath });
    } catch (e) {
        console.error('[API] Failed to export errors:', e);
        res.status(500).json({ error: e.message });
    }
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

// TAXONOMY DOCTOR: Re-Evaluate a specific tag
app.post('/api/taxonomy/re-eval', (req, res) => {
    const { tag } = req.body;
    if (!tag) return res.status(400).json({ error: 'Tag required' });

    try {
        // Matches tag surrounded by delimiters or start/end of string
        // robust against "Tag, Tag" vs "Tag,Tag" by removing spaces for the check
        const stmt = database.prepare(`
            UPDATE books 
            SET content_scanned = 0, tags = NULL, summary = NULL
            WHERE ',' || REPLACE(tags, ' ', '') || ',' LIKE ?
        `);
        const result = stmt.run(`%,${tag.trim()},%`);
        console.log(`[TaxonomyDoctor] Re-evaluating tag '${tag}'. Reset ${result.changes} books.`);
        res.json({ success: true, count: result.changes });
    } catch (e) {
        console.error('[TaxonomyDoctor] Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// TAXONOMY DOCTOR: Apply Implication Rules (Rule-Based Fixes)
app.post('/api/taxonomy/apply-implications', async (req, res) => {
    try {
        const rulesPath = RULES_PATH;
        if (!fs.existsSync(rulesPath)) {
            return res.json({ success: true, changes: 0, message: 'No rules file found.' });
        }

        const ruleContent = fs.readFileSync(rulesPath, 'utf8');
        const lines = ruleContent.split('\n');
        let totalChanges = 0;
        let appliedRules = [];

        // Simple Parser for "If X, ensures Y" or "X -> Y"
        // We look for logic: "If a book is about X, ensures it is also tagged with Y"
        // Regex: /If .*?`([^`]+)`.*?ensures.*?`([^`]+)`/i
        
        for (const line of lines) {
            const match = line.match(/If .*?`([^`]+)`.*?ensures.*?`([^`]+)`/i);
            if (match) {
                const [_, childTag, parentTag] = match;
                // Query: Update books having child but NOT parent
                // We use REPLACE to handle spacing variations
                const stmt = database.prepare(`
                    UPDATE books 
                    SET tags = tags || ', ' || ? 
                    WHERE ',' || REPLACE(tags, ' ', '') || ',' LIKE ? 
                    AND ',' || REPLACE(tags, ' ', '') || ',' NOT LIKE ?
                `);
                
                const result = stmt.run(parentTag, `%,${childTag},%`, `%,${parentTag},%`);
                if (result.changes > 0) {
                    totalChanges += result.changes;
                    appliedRules.push(`${childTag} -> ${parentTag} (${result.changes} books)`);
                    console.log(`[TaxonomyDoctor] Applied Rule: ${childTag} -> ${parentTag} (${result.changes} updated)`);
                }
            }
        }

        res.json({ success: true, changes: totalChanges, applied: appliedRules });
    } catch (e) {
        console.error('[TaxonomyDoctor] Application Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// TAXONOMY DOCTOR: Get Rules
app.get('/api/taxonomy/rules', (req, res) => {
    try {
        const rulesPath = RULES_PATH;
        if (fs.existsSync(rulesPath)) {
            const content = fs.readFileSync(rulesPath, 'utf8');
            res.json({ success: true, content });
        } else {
            res.json({ success: true, content: '' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// TAXONOMY DOCTOR: Save Rules
app.post('/api/taxonomy/rules', (req, res) => {
    try {
        const { content } = req.body;
        const rulesPath = RULES_PATH;
        fs.writeFileSync(rulesPath, content, 'utf8');
        console.log('[TaxonomyDoctor] Rules updated by user.');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- UTILITIES FRAMEWORK ---

// --- UTILITIES FRAMEWORK ---
import { loadUtilities as initUtilities, getUtility, getAllUtilities } from './utilities/manager.js';

// Load on startup
initUtilities();

// List Utilities
app.get('/api/utilities', (req, res) => {
    res.json({ success: true, utilities: getAllUtilities() });
});

// Run Utility Scan
app.post('/api/utilities/:id/scan', async (req, res) => {
    const { id } = req.params;
    const utility = getUtility(id);

    if (!utility) return res.status(404).json({ error: 'Utility not found' });
    if (!utility.scan) return res.status(400).json({ error: 'Utility does not support scanning' });

    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        console.log(`[Utilities] Scanning ${id}...`);
        
        // Pass onProgress callback
        const result = await utility.scan({ 
            ...req.body,
            onProgress: (stats) => {
                res.write(`data: ${JSON.stringify({ type: 'progress', ...stats })}\n\n`);
            }
        });

        res.write(`data: ${JSON.stringify({ type: 'complete', result })}\n\n`);
        res.end();
    } catch (e) {
        console.error(`[Utilities] Scan error for ${id}:`, e);
        try {
            res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
            res.end();
        } catch (ignore) {}
    }
});

// Run Utility Execution
app.post('/api/utilities/:id/run', async (req, res) => {
    const { id } = req.params;
    const utility = getUtility(id);

    if (!utility) return res.status(404).json({ error: 'Utility not found' });
    if (!utility.process) return res.status(400).json({ error: 'Utility does not support execution' });

    try {
        console.log(`[Utilities] Executing ${id}...`);
        const result = await utility.process(req.body);
        res.json({ success: true, result });
    } catch (e) {
        console.error(`[Utilities] Execution error for ${id}:`, e);
        res.status(500).json({ error: e.message });
    }
});


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
