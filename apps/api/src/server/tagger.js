import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { getActiveModelPath } from './config.js';

const require = createRequire(import.meta.url);
const { EPub } = require('epub2');
// PDFParse v2 exports a class, ensuring we get the constructor
const pdfLib = require('pdf-parse');
const PDFParse = pdfLib.PDFParse || pdfLib;

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
            console.error(`[Tagger] EPUB Text Extraction Error (${path.basename(filepath)}):`, err.message);
            return { error: `Extraction Failed: ${err.message}` };
        }
    } else if (ext === '.pdf') {
        try {
            const dataBuffer = await fs.promises.readFile(filepath);
            // Robust instantiation
            let parser;
            try {
                parser = new PDFParse({ data: dataBuffer });
            } catch (instantiateErr) {
                // Fallback for different export styles
                 if (typeof PDFParse === 'function') {
                    // Try calling as function if new fails (unlikely given new PDFParse check)
                    const result = await PDFParse(dataBuffer);
                    return result.text.substring(0, MAX_CONTENT_CHARS);
                 }
                 throw instantiateErr;
            }
            const pdf = await parser.getText();
            return pdf.text.substring(0, MAX_CONTENT_CHARS);
        } catch (err) {
            console.error(`[Tagger] PDF Text Extraction Error (${path.basename(filepath)}):`, err.message);
            return { error: `Extraction Failed: ${err.message}` };
        }
    } else if (ext === '.txt' || ext === '.md') {
        try {
            const content = await fs.promises.readFile(filepath, 'utf8');
            return content.substring(0, MAX_CONTENT_CHARS);
        } catch (err) {
            console.error(`[Tagger] Text Extraction Error (${path.basename(filepath)}):`, err.message);
            return { error: `Extraction Failed: ${err.message}` };
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
 * Singleton manager for local Llama instance
 */
let llamaInstance = null;
let modelInstance = null;
let contextInstance = null;
let activeContextSize = 0;

export async function getLlamaManager(modelPath) {
    if (modelInstance && modelInstance.modelPath === modelPath) {
        return { model: modelInstance, context: contextInstance };
    }

    console.log(`[Llama] Loading model from: ${modelPath}`);
    const { getLlama } = await import('node-llama-cpp');
    
    if (!llamaInstance) {
        // Auto-detect best GPU backend (CUDA, Vulkan, Metal)
        llamaInstance = await getLlama(); 
    }

    // Disposal prevents VRAM leaks on reload
    if (modelInstance) {
         // modelInstance.dispose(); // Common in some versions, but we'll trust GC or overwrite for now to avoid crashes
    }

    modelInstance = await llamaInstance.loadModel({ 
        modelPath,
        gpuLayers: 'max' // Force max GPU usage
    });
    
    // Dynamic Context Size Fallback
    const contextSizes = [8192, 4096, 2048];
    for (const size of contextSizes) {
        try {
            console.log(`[Llama] Attempting to create context with size: ${size}`);
            contextInstance = await modelInstance.createContext({ contextSize: size });
            console.log(`[Llama] Context created successfully at ${size} tokens.`);
            activeContextSize = size;
            break; // Success
        } catch (e) {
            console.warn(`[Llama] Failed to create context at ${size}: ${e.message}`);
            if (size === 2048) {
                throw new Error("Failed to initialize AI context even at lowest setting (2048). VRAM might be full.");
            }
        }
    }
    
    return { model: modelInstance, context: contextInstance };
}

export function getActiveContextSize() {
    return activeContextSize;
}

async function getTagsFromLocalLlama(text, modelPath) {
    try {
        const { model, context } = await getLlamaManager(modelPath);
        const { LlamaChatSession } = await import('node-llama-cpp');
        
        const customRules = loadTaggingRules();
        let systemPrompt = SYSTEM_PROMPT;
        if (customRules) {
            systemPrompt += `\n\nCRITICAL USER DEFINED RULES:\n${customRules}\n\nStrictly follow the above rules when generating tags.`;
        }

        const session = new LlamaChatSession({ 
            contextSequence: context.getSequence(),
            systemPrompt 
        });

        console.log('[Llama] Generating tags...');
        const startTime = Date.now();
        const response = await session.prompt(`Book Excerpt:\n\n${text}`, {
            grammar: await llamaInstance.getGrammarFor("json"),
            maxTokens: 500,
            temperature: 0.3
        });
        const endTime = Date.now();
        const durationSeconds = (endTime - startTime) / 1000;

        console.log('[Llama] Response received.');
        
        try {
            const parsed = JSON.parse(response);
            // Removed token tracking
            return { 
                result: parsed, 
                usage: {} // Empty usage object as per instruction
            };
        } catch (e) {
            console.error("[Llama] Invalid JSON from local AI:", response);
            return null;
        }
    } catch (err) {
        console.error("[Llama] Local AI Error:", err.message);
        return { error: `Local AI Error: ${err.message}` };
    }
}

/**
 * Call Local LLM to get tags/summary
 */
async function getTagsFromAI(text) {
    try {
        if (text) {
             console.log(`[Tagger] Text Preview: ${text.substring(0, 50).replace(/\n/g, ' ')}...`);
        }

        const modelPath = getActiveModelPath();
        
        if (!modelPath) {
             console.error('[Tagger] No embedded model selected.');
             return { error: 'No local model selected. Please pick one in Utilities.' };
        }

        return await getTagsFromLocalLlama(text, modelPath);

    } catch (err) {
        console.error("[Tagger] AI Service Error:", err.message);
        return { error: `AI Error: ${err.message}` };
    }
}

/**
 * Main function to process a book
 */
export async function processBookContent(filepath) {
    const textData = await extractContentText(filepath);
    
    if (textData && typeof textData === 'object' && textData.error) {
        return textData; // Pass through extraction error
    }

    const text = textData;
    // Lowered threshold to 5 characters for better compatibility with short books
    if (!text || text.trim().length < 5) {
        console.warn(`[Tagger] Not enough text extracted from ${path.basename(filepath)} (Length: ${text ? text.trim().length : 0})`);
        return null;
    }

    console.log(`[Tagger] Sending text to AI for ${path.basename(filepath)} (${text.length} chars)...`);
    const responseData = await getTagsFromAI(text);
    
    if (responseData && responseData.result && responseData.result.tags) {
        const { result, usage } = responseData;
        // Normalize tags: Pascal-Case-With-Hyphens and comma-separated string
        const formattedTags = result.tags
            .map(t => normalizeTag(t))
            .filter(t => t.length > 0);
            
        return {
            tags: formattedTags.join(', '),
            summary: result.summary || '',
            // Removed token tracking from here
        };
    }
    
    if (responseData && responseData.error) {
        return { error: responseData.error };
    }
    
    return null;
}
