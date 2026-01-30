import fs from 'fs';
import path from 'path';
import { getAllBooks, updateMasterTags, updateBookTags, runTransaction } from './db.js';

const TAXONOMY_FILE = path.resolve('taxonomy.json');

const LM_STUDIO_URL = 'http://localhost:1234/v1/chat/completions';

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

    try {
        const response = await fetch(LM_STUDIO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "model-identifier", // LM Studio ignores this but needs it
                messages: [
                    { role: "system", content: "You are a data classification expert." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1
            })
        });

        const data = await response.json();
        const content = data.choices[0].message.content;
        const jsonStr = content.match(/\{[\s\S]*\}/)?.[0] || content;
        return JSON.parse(jsonStr);
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
    const existingTags = new Set(Object.keys(existingMapping));
    
    // Identify ONLY new tags that haven't been mapped yet
    const newTags = uniqueTags.filter(tag => !existingTags.has(tag));

    let mapping = { ...existingMapping };
    let updatedCount = 0;
    
    if (newTags.length > 0) {
        console.log(`[Taxonomy] Found ${newTags.length} NEW tags. Processing in batches...`);
        
        // Process in batches of 20 to avoid overwhelming the LLM
        const batches = chunkArray(newTags, 20);
        
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`[Taxonomy] Processing Batch ${i + 1}/${batches.length} (${batch.length} tags)...`);
            onProgress({ 
                type: 'progress_learning', 
                current: i + 1, 
                total: batches.length, 
                tagsInBatch: batch.length 
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
    } else {
        console.log('[Taxonomy] No new tags to learn.');
    }

    // Apply mapping (existing + new) to all books
    console.log('[Taxonomy] Applying master tags to database...');
    onProgress({ type: 'phase_applying' });

    const books = getAllBooks();
    const totalBooks = books.length;
    let processedBooks = 0;
    
    runTransaction(() => {
        for (const book of books) {
            processedBooks++;
            if (processedBooks % 10 === 0 || processedBooks === totalBooks) {
                 onProgress({ 
                    type: 'progress_applying', 
                    current: processedBooks, 
                    total: totalBooks 
                });
            }

            if (book.tags) {
                // 1. Compute top Master Tags
                const masterTagsStr = computeMasterTags(book.tags);

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
                    console.log(`[Taxonomy] Pruning redundant tags for ${path.basename(book.filepath)}: "${book.tags}" -> "${newTagsStr}"`);
                    updateBookTags(book.filepath, newTagsStr);
                }
                
                // 4. Update Master Tags (if changed)
                const currentMasterTags = book.master_tags || '';
                
                if (currentMasterTags !== masterTagsStr) {
                    console.log(`[Taxonomy] Updating ${path.basename(book.filepath)}: "${currentMasterTags}" -> "${masterTagsStr}"`);
                    updateMasterTags(book.filepath, masterTagsStr);
                    updatedCount++;
                }
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
export function computeMasterTags(tagsStr) {
    if (!tagsStr) return '';
    const mapping = getStoredMapping();
    
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
