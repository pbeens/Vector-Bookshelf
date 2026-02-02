import fs from 'fs';
import path from 'path';
import { getAllBooks, getBooksForTaxonomySync, updateMasterTags, updateBookTags, runTransaction } from './db.js';
import { getActiveModelPath } from './config.js';
import { getLlamaManager } from './tagger.js';

const TAXONOMY_FILE = path.resolve('taxonomy.json');

/**
 * Gets all unique non-master tags from the database
 */
function getUniqueSubTags() {
    const books = getAllBooks();
    const tags = new Set();
    books.forEach(book => {
        if (book.tags) {
            book.tags.split(',').forEach(t => tags.add(t.trim()));
        }
    });
    return Array.from(tags).sort();
}

const PREFERRED_CATEGORIES = [
    "Fiction", "Non-Fiction", // Primary Categories
    "Science-Fiction", "Fantasy", "Mystery-Thriller", "Horror", "Literature", "History", 
    "Biography-Memoir", "Science-Technology", "Computer-Science", "Programming", 
    "Artificial-Intelligence", "Business-Economics", "Finance", "Self-Help", 
    "Psychology", "Philosophy", "Education", "Arts-Design", "Politics-Society", 
    "Health-Medicine", "Cooking-Food", "Travel", "Religion-Spirituality"
];

const PREFERRED_CATEGORIES_STR = PREFERRED_CATEGORIES.join(', ');

/**
 * Normalizes a tag to a canonical format.
 * e.g., "Sci Fi " -> "sci-fi"
 */
function normalizeTag(tag) {
    return tag.toLowerCase()
        .replace(/[\s_]+/g, '-')     // generic separators to hyphen
        .replace(/[^a-z0-9\-\.]/g, '') // remove special chars except dots (for .net)
        .replace(/^-+|-+$/g, '');    // trim hyphens
}

/**
 * Deterministic Rules Engine
 * Returns a Master Category or null
 */
function classifyTagByRules(tag) {
    const t = normalizeTag(tag);
    
    // 1. History (Dates/Eras/War)
    if (/^\d{4}s?(-.*)?$/.test(t)) return 'History'; // 1990s, 1980s-culture, 1984
    if (/^\d{1,2}(th|st|nd|rd)-century/.test(t)) return 'History'; // 19th-century
    if (t.includes('history') || t.includes('biography') || t.includes('memoir')) return 'History';
    if (t.includes('war') || t.includes('military') || t.includes('battle')) return 'History';

    // 2. Computer Science / Programming
    if (/^(js|python|rust|c\+\+|java|ruby|php|sql|css|html)(\d*|script)?(\-|$)/.test(t)) return 'Computer-Science';
    if (/\.net/.test(t) || t === 'c#' || t === 'f#') return 'Programming';
    if (t.includes('programming') || t.includes('software') || t.includes('coding')) return 'Programming';
    if (t.includes('algorithm') || t.includes('data-science') || t.includes('machine-learning')) return 'Computer-Science';

    // 3. Society / Politics / Religion
    if (t.includes('politics') || t.includes('government') || t.includes('election')) return 'Politics-Society';
    if (t.includes('religion') || t.includes('spirituality') || t.includes('bible') || t.includes('church')) return 'Religion-Spirituality';
    if (t.includes('buddhism') || t.includes('taoism') || t.includes('christianity') || t.includes('islam')) return 'Religion-Spirituality';

    // 4. Arts / Culture
    if (t.includes('art') || t.includes('design') || t.includes('music') || t.includes('cinema') || t.includes('film')) return 'Arts-Design';
    if (t.includes('photography') || t.includes('architecture')) return 'Arts-Design';

    // 5. Business / Finance
    if (t.includes('business') || t.includes('management') || t.includes('leadership')) return 'Business-Economics';
    if (t.includes('finance') || t.includes('economics') || t.includes('investing')) return 'Finance';

    // 3. Suffixes/Keywords
    if (t.endsWith('fiction')) {
        if (t.includes('science')) return 'Science-Fiction';
        return 'Fiction';
    }
    if (t.includes('fantasy')) return 'Fantasy';
    if (t.includes('thriller') || t.includes('mystery')) return 'Mystery-Thriller';
    if (t.includes('horror')) return 'Horror';
    if (t.includes('cooking') || t.includes('recipe') || t.includes('cookbook')) return 'Cooking-Food';
    if (t.includes('psychology')) return 'Psychology';
    if (t.includes('finance') || t.includes('economics')) return 'Finance';
    if (t.includes('education') || t.includes('tutorial')) return 'Education';

    return null;
}

/**
 * Singleton manager for local Llama instance in Taxonomy
 * (Ideally this would be shared with tagger.js)
 */
// variables managed in tagger.js

// getLlamaManager imported from tagger.js


/**
 * Ask AI to group tags into high-level master categories
 */
async function generateMapping(uniqueTags) {
    if (uniqueTags.length === 0) return {};

    const prompt = `
    Analyze this list of specific book tags:
    ${uniqueTags.join(', ')}

    Your goal is to map each tag to ONE of the following "Master Categories":
    ${PREFERRED_CATEGORIES_STR}

    If a tag fits none of these perfectly, choose the closest match or a similarly broad category.
    
    CRITICAL RULES:
    1. DO NOT use generic terms like "General", "Book", "Novel", "Series".
    2. "Fiction" and "Non-Fiction" ARE allowed and encouraged for generic tags.
    3. Use "Science-Fiction" instead of "Sci-Fi".
    4. Return ONLY a valid JSON object: key = specific tag, value = Master Category.

    Example:
    {
      "Python-Programming": "Programming",
      "Space-Opera": "Science-Fiction",
      "World-War-II": "History",
      "Novel": "Fiction"
    }
    `;

    const modelPath = getActiveModelPath();
    if (!modelPath) {
        console.error("[Taxonomy] No local model selected.");
        return null;
    }

    try {
        const { context } = await getLlamaManager(modelPath);
        const { LlamaChatSession } = await import('node-llama-cpp');
        
        const session = new LlamaChatSession({ 
            contextSequence: context.getSequence(),
            systemPrompt: "You are a data classification expert."
        });

        console.log('[Taxonomy-Llama] Generating mapping...');
        const response = await session.prompt(prompt, {
            grammar: await llamaInstance.getGrammarFor("json"),
            maxTokens: 1000,
            temperature: 0.1
        });

        try {
            return JSON.parse(response);
        } catch (e) {
            console.error("[Taxonomy-Llama] Invalid JSON:", response);
            return null;
        }
    } catch (err) {
        console.error("[Taxonomy] AI Error:", err.message);
        return null;
    }
}

/**
 * Main function: Learns taxonomy and applies it
 */
// Helper to chunk array
function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

export async function syncAdaptiveTaxonomy(onProgress = () => {}) {
    console.log('[Taxonomy] Starting Adaptive Learning...');
    onProgress({ type: 'start' });
    const uniqueTags = getUniqueSubTags();
    
    if (uniqueTags.length === 0) {
        return { success: false, message: 'No tags found.' };
    }

    // Load existing mapping
    const existingMapping = getStoredMapping();
    // OPTIMIZATION: Create a normalized set of existing keys to avoid case/separator mismatches
    // e.g. "Space-Opera" in JSON should match "space opera" from DB
    const normalizedExistingTags = new Set();
    Object.keys(existingMapping).forEach(key => {
        normalizedExistingTags.add(normalizeTag(key));
    });
    
    // Identify ONLY new tags that haven't been mapped yet
    // check normalizeTag(tag) against the set
    let newTags = uniqueTags.filter(tag => !normalizedExistingTags.has(normalizeTag(tag)));

    let mapping = { ...existingMapping };
    
    // --- OPTIMIZATION: Rule-Based Pre-Classification ---
    // Filter out tags we can categorize deterministically
    const tagsToLearn = [];
    let rulesAppliedCount = 0;

    for (const tag of newTags) {
        const ruleCategory = classifyTagByRules(tag);
        if (ruleCategory) {
            mapping[tag] = ruleCategory;
            rulesAppliedCount++;
        } else {
            // Also check if the tag ITSELF is a master category
            // e.g. "Science-Fiction" -> "Science-Fiction"
            const normalizedTag = normalizeTag(tag);
            const directMatch = PREFERRED_CATEGORIES.find(c => normalizeTag(c) === normalizedTag);
            
            if (directMatch) {
                mapping[tag] = directMatch;
                rulesAppliedCount++;
            } else {
                tagsToLearn.push(tag);
            }
        }
    }

    if (rulesAppliedCount > 0) {
        console.log(`[Taxonomy] Auto-classified ${rulesAppliedCount} tags using rules/normalization.`);
        // Save intermediate results
        fs.writeFileSync(TAXONOMY_FILE, JSON.stringify(mapping, null, 2));
    }
    
    if (tagsToLearn.length > 0) {
        const totalGlobalTags = uniqueTags.length;
        const knownTagsCount = totalGlobalTags - tagsToLearn.length;
        
        console.log(`[Taxonomy] Learning ${tagsToLearn.length} new tags (Total: ${totalGlobalTags}, Known: ${knownTagsCount}).`);
        
        // Process in batches of 500 (Safe for 8k+ context models)
        const batches = chunkArray(tagsToLearn, 500);
        
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const currentProcessed = knownTagsCount + (i * 500) + batch.length;
            
            console.log(`[Taxonomy] Processing Batch ${i + 1}/${batches.length} (${batch.length} tags) -> Global Progress: ${currentProcessed}/${totalGlobalTags}`);
            
            onProgress({ 
                type: 'progress_learning', 
                currentBatch: i + 1, 
                totalBatches: batches.length, 
                tagsInBatch: batch.length,
                processedGlobal: currentProcessed,
                totalGlobal: totalGlobalTags
            });
            
            const batchMapping = await generateMapping(batch);
            
            if (batchMapping) {
                // Merge and Save Immediately
                mapping = { ...mapping, ...batchMapping };
                try {
                    fs.writeFileSync(TAXONOMY_FILE, JSON.stringify(mapping, null, 2));
                    console.log(`[Taxonomy] Batch ${i + 1} saved.`);
                } catch (err) {
                    console.error('[Taxonomy] Failed to save partial mapping:', err.message);
                }
            } else {
                console.warn(`[Taxonomy] Batch ${i + 1} failed. Skipping.`);
            }
        }
    }

    // Apply mapping (existing + new) to all books
    console.log('[Taxonomy] Applying master tags to database...');
    onProgress({ type: 'phase_applying' });

    // OPTIMIZATION: Only fetch necessary columns, and only books with tags
    const books = getBooksForTaxonomySync();
    const totalBooks = books.length;
    let processedBooks = 0;
    
    // Load mapping ONCE for the entire batch to avoid 32k file reads
    const finalMapping = getStoredMapping();
    let updatedCount = 0;

    runTransaction(() => {
        for (const book of books) {
            processedBooks++;
            if (processedBooks % 50 === 0 || processedBooks === totalBooks) {
                 onProgress({ 
                    type: 'progress_applying', 
                    current: processedBooks, 
                    total: totalBooks 
                });
            }

            // 1. Compute top Master Tags (Passing mapping to avoid disk I/O)
            const masterTagsStr = computeMasterTags(book.tags, finalMapping);

            // 2. Identify Redundant Sub-Tags
            const masterTagsList = masterTagsStr.split(',').map(t => t.trim());
            const subTags = book.tags.split(',').map(t => t.trim());
            
            const filteredSubTags = subTags.filter(tag => {
                const normalizedTag = tag.toLowerCase().replace(/[^a-z0-9]/g, '');
                const isRedundant = masterTagsList.some(master => {
                    const normalizedMaster = master.toLowerCase().replace(/[^a-z0-9]/g, '');
                    return normalizedTag === normalizedMaster;
                });
                return !isRedundant;
            });
            
            const newTagsStr = filteredSubTags.join(', ');

            // 3. Update DB if Tags Changed
            if (newTagsStr !== book.tags) {
                // console.log(`[Taxonomy] Pruning ${path.basename(book.filepath)}`); // Silent for speed
                updateBookTags(book.filepath, newTagsStr);
            }
            
            // 4. Update Master Tags (if changed)
            const currentMasterTags = book.master_tags || '';
            
            if (currentMasterTags !== masterTagsStr) {
                // console.log(`[Taxonomy] Updating ${path.basename(book.filepath)}`); // Silent for speed
                updateMasterTags(book.filepath, masterTagsStr);
                updatedCount++;
            }
        }
    });

    console.log(`[Taxonomy] Complete. Updated ${updatedCount} books.`);
    return { success: true, count: updatedCount };
}

/**
 * Gets the current stored mapping
 */
export function getStoredMapping() {
    try {
        if (fs.existsSync(TAXONOMY_FILE)) {
            return JSON.parse(fs.readFileSync(TAXONOMY_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[Taxonomy] Error reading mapping:', e.message);
    }
    return {};
}

const CATEGORY_TYPE_MAP = {
    "Science-Fiction": "Fiction",
    "Fantasy": "Fiction",
    "Mystery-Thriller": "Fiction",
    "Horror": "Fiction",
    "Literature": "Fiction",
    "Fiction": "Fiction",
    
    // Default everything else to Non-Fiction if not specified above, 
    // but let's be explicit for the preferred list
    "History": "Non-Fiction",
    "Biography-Memoir": "Non-Fiction",
    "Science-Technology": "Non-Fiction",
    "Computer-Science": "Non-Fiction",
    "Programming": "Non-Fiction",
    "Business-Economics": "Non-Fiction",
    "Finance": "Non-Fiction",
    "Self-Help": "Non-Fiction",
    "Psychology": "Non-Fiction",
    "Philosophy": "Non-Fiction",
    "Education": "Non-Fiction",
    "Arts-Design": "Non-Fiction",
    "Politics-Society": "Non-Fiction",
    "Health-Medicine": "Non-Fiction",
    "Cooking-Food": "Non-Fiction",
    "Travel": "Non-Fiction",
    "Religion-Spirituality": "Non-Fiction",
    "Non-Fiction": "Non-Fiction"
};

/**
 * Computes master tags for a comma-separated string of tags.
 * Logic:
 * 1. Count frequency of mapped Master Categories.
 * 2. Determine if clearly Fiction or Non-Fiction based on top categories.
 * 3. Return: [Fiction/Non-Fiction], [Top Category 1], [Top Category 2]
 */
export function computeMasterTags(tagsStr, providedMapping = null) {
    if (!tagsStr) return '';
    const mapping = providedMapping || getStoredMapping();
    
    // Create a normalized lookup map (lowercase, spaces to hyphens)
    const normalizedMapping = {};
    Object.keys(mapping).forEach(key => {
        const normalizedKey = key.toLowerCase().replace(/[\s_]+/g, '-');
        normalizedMapping[normalizedKey] = mapping[key];
        // Also keep raw lower
        normalizedMapping[key.toLowerCase()] = mapping[key];
    });

    const tags = tagsStr.split(',').map(t => t.trim());
    
    const categoryCounts = {};
    
    tags.forEach(tag => {
        // Try exact match first
        let category = mapping[tag];
        
        // Try normalized match
        if (!category) {
            const lower = tag.toLowerCase();
            const kebab = lower.replace(/[\s_]+/g, '-');
            category = normalizedMapping[lower] || normalizedMapping[kebab];
        }

        if (category) {
            categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        } else {
             // Optional: Log missing tags if needed for debug, but spammy
        }
    });

    // Get sorted specific categories
    const topCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0]);

    // Determine Super-Type (Fiction vs Non-Fiction)
    // We look at the top categories. If any is Fiction, we lean Fiction.
    let superType = null;
    
    for (const cat of topCategories) {
        const type = CATEGORY_TYPE_MAP[cat];
        if (type) {
            // First hit defines success, but prioritize Fiction if mixed? 
            // Usually books are one or the other. Let's take the most frequent one's type.
            superType = type;
            break; 
        }
    }

    // Filter out "Fiction" and "Non-Fiction" from the specific list to avoid duplication
    // (since we will prepend the superType)
    let specificTags = topCategories.filter(c => c !== 'Fiction' && c !== 'Non-Fiction');
    
    // Take top 2 specific tags
    specificTags = specificTags.slice(0, 2);
    
    // Construct final list
    const finalTags = [];
    if (superType) {
        finalTags.push(superType);
    }
    
    finalTags.push(...specificTags);
    
    // Dedupe just in case
    return Array.from(new Set(finalTags)).join(', ');
}
