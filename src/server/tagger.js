import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { EPub } = require('epub2');
const { PDFParse } = require('pdf-parse');

const LM_STUDIO_URL = 'http://100.64.219.180:1234/v1/chat/completions';
const MAX_CONTENT_CHARS = 5000;

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
    
    if (ext === '.epub') {
        try {
            const epub = await EPub.createAsync(filepath);
            let fullText = '';
            // Get first few "chapters" (usually includes intro/preface)
            for (let i = 0; i < Math.min(epub.flow.length, 5); i++) {
                const chapter = await epub.getChapterRawAsync(epub.flow[i].id);
                // Simple HTML tag removal
                fullText += chapter.replace(/<[^>]*>?/gm, ' ') + ' ';
                if (fullText.length > MAX_CONTENT_CHARS) break;
            }
            return fullText.substring(0, MAX_CONTENT_CHARS);
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

/**
 * Call LM Studio to get tags/summary
 */
async function getTagsFromAI(text) {
    try {
        const response = await fetch(LM_STUDIO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "model-identifier",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: `Here is the book content:\n\n${text}` }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LM Studio Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        
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
        console.error("[Tagger] AI Service Error:", err.message);
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
