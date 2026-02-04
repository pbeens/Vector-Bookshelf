import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const utilities = new Map();

/**
 * Discovers and loads all utility modules from the current directory.
 */
export async function loadUtilities() {
    const utilsDir = path.resolve('src/server/utilities');
    
    // Ensure directory exists
    if (!fs.existsSync(utilsDir)) {
        console.warn(`[UtilityManager] Directory not found: ${utilsDir}`);
        return;
    }

    const files = fs.readdirSync(utilsDir).filter(f => f.endsWith('.js') && f !== 'manager.js');
    
    for (const file of files) {
        try {
            // Convert path to file URL for Windows compatibility with ESM import
            const filePath = path.join(utilsDir, file);
            const fileUrl = pathToFileURL(filePath).href;
            
            const module = await import(fileUrl); 
            
            if (module.metadata && module.metadata.id) {
                utilities.set(module.metadata.id, module);
                console.log(`[Utilities] Loaded: ${module.metadata.name} (${module.metadata.id})`);
            }
        } catch (e) {
            console.error(`[Utilities] Failed to load ${file}:`, e);
        }
    }
}

/**
 * Get a specific utility by ID
 */
export function getUtility(id) {
    return utilities.get(id);
}

/**
 * Get all loaded utilities metadata
 */
export function getAllUtilities() {
    return Array.from(utilities.values()).map(u => u.metadata);
}
