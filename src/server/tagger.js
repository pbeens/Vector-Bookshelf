import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { EPub } = require('epub2');
const { PDFParse } = require('pdf-parse');

const LM_STUDIO_URL = 'http://localhost:1234/v1/chat/completions';
const MAX_CONTENT_CHARS = 5000; // Requires ~6K context window in LM Studio (adjust if using smaller models)

const SYSTEM_PROMPT = `
You are a professional librarian and book classifier.
Analyze the provided text excerpt from a book (Preface, Introduction, or Content).
Provide:
1. A list of 5-8 specific, high-quality tags. 
   CRITICAL: DO NOT include generic tags like "Fiction" or "Non-Fiction" - these will be determined automatically.
   CRITICAL: Focus on SPECIFIC genres, topics, and themes (e.g., "Science-Fiction", "Mystery-Thriller", "Machine-Learning", "Business-Strategy").
   CRITICAL: Each tag MUST be in "Pascal-Case-With-Hyphens" format. No spaces allowed.
2. A single-sentence summary of what the book is about.

Respond ONLY in valid JSON format:
{
  "tags": ["Science-Fiction", "Space-Opera", "Military-Fiction", ...],
  "summary": "..."
}
`;

/**
 * Ensures tags are in Pascal-Case-With-Hyphens
 */
function normalizeTag(tag) {
    if (!tag) return '';
    return tag
        .trim()
        .split(/[\s_-]+/) // split by space, underscore or hyphen
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('-');
}

/**
 * Extract text for tagging
 */
async function extractContentText(filepath) {
    const ext = path.extname(filepath).toLowerCase();
    console.log(`[Tagger] Extracting text from ${path.basename(filepath)} (${ext})...`);
    
    if (ext === '.epub') {
        try {
            // TIMEOUT WRAPPER for EPUB Extraction
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('EPUB Parsing Timed Out (15s)')), 15000)
            );

            const extractionPromise = (async () => {
                const epub = await EPub.createAsync(filepath).catch(err => { throw err; });
                let fullText = '';
                for (let i = 0; i < Math.min(epub.flow.length, 5); i++) {
                    const chapter = await epub.getChapterRawAsync(epub.flow[i].id).catch(e => '');
                    if (chapter) {
                        fullText += chapter.replace(/<[^>]*>?/gm, ' ') + ' ';
                    }
                    if (fullText.length > MAX_CONTENT_CHARS) break;
                }
                return fullText.substring(0, MAX_CONTENT_CHARS);
            })();

            return await Promise.race([extractionPromise, timeoutPromise]);
        } catch (err) {
            console.error(`[Tagger] EPUB Text Extraction Error (${filepath}):`, err.message);
            return null;
        }
    } else if (ext === '.pdf') {
        try {
            const dataBuffer = await fs.promises.readFile(filepath);
            const parser = new PDFParse({ data: dataBuffer });
            // Extract first 10 pages for analysis
            const result = await parser.getText({ first: 10 });
            return result.text.substring(0, MAX_CONTENT_CHARS);
        } catch (err) {
            console.error(`[Tagger] PDF Text Extraction Error (${filepath}):`, err.message);
            return null;
        }
    }
    return null;
}

const TAGGING_RULES_PATH = path.resolve('tagging_rules.md');

function loadTaggingRules() {
    try {
        if (fs.existsSync(TAGGING_RULES_PATH)) {
            console.log('[Tagger] Loaded custom tagging rules.');
            return fs.readFileSync(TAGGING_RULES_PATH, 'utf-8');
        }
    } catch (e) {
        console.error('[Tagger] Failed to load tagging rules:', e.message);
    }
    return '';
}

/**
 * Call LM Studio to get tags/summary
 */
async function getTagsFromAI(text) {
    try {

        if (text) {
             console.log(`[Tagger] Text Preview: ${text.substring(0, 50).replace(/\n/g, ' ')}...`);
        }

        console.error(`[Tagger] Calling LM Studio at ${LM_STUDIO_URL}...`);
        
        // Inject Custom Rules
        const customRules = loadTaggingRules();
        let prompt = SYSTEM_PROMPT;
        if (customRules) {
            prompt += `\n\nCRITICAL USER DEFINED RULES:\n${customRules}\n\nStrictly follow the above rules when generating tags.`;
        }
        
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for debugging
        
        console.error(`[Tagger] Fetching...`);
        const response = await fetch(LM_STUDIO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "local-model", // LM Studio ignores this, but required
                messages: [
                    { role: "system", content: prompt },
                    { role: "user", content: `Book Excerpt:\n\n${text}` }
                ],
                temperature: 0.3,
                max_tokens: 500
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        console.error(`[Tagger] Fetch complete. Status: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LM Studio Error ${response.status}: ${errorText}`);
        }

        console.error(`[Tagger] Parsing JSON response...`);
        const data = await response.json();
        console.error(`[Tagger] JSON parsed. Extracting content...`);
        const content = data.choices[0].message.content;
        
        console.error(`[Tagger] AI Response received (Length: ${content.length})`);
        
        // Try to parse JSON from response
        try {
            // Some models might wrap JSON in backticks
            const jsonStr = content.match(/\{[\s\S]*\}/)?.[0] || content;
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error("[Tagger] Invalid JSON from AI:", content);
            return null;
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error("[Tagger] AI Service Timeout: Request took longer than 3 mins");
        } else {
            console.error("[Tagger] AI Service Error:", err.message);
        }
        return null;
    }
}

/**
 * Main function to process a book
 */
export async function processBookContent(filepath) {
    const text = await extractContentText(filepath);
    if (!text || text.trim().length < 50) {
        console.warn(`[Tagger] Not enough text extracted from ${path.basename(filepath)}`);
        return null;
    }

    console.log(`[Tagger] Sending text to AI for ${path.basename(filepath)} (${text.length} chars)...`);
    const result = await getTagsFromAI(text);
    
    if (result && result.tags) {
        // Normalize tags: Pascal-Case-With-Hyphens and comma-separated string
        const formattedTags = result.tags
            .map(t => normalizeTag(t))
            .filter(t => t.length > 0);
            
        return {
            tags: formattedTags.join(', '),
            summary: result.summary || ''
        };
    }
    return null;
}
