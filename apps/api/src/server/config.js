import fs from 'fs';
import path from 'path';
import { MODELS_PATH, USER_DATA_PATH } from './paths.js';

const CONFIG_PATH = path.join(USER_DATA_PATH, 'llm_config.json');

const DEFAULT_CONFIG = {
    models_dir: MODELS_PATH, // Default models folder (primary)
    model_search_paths: [MODELS_PATH], // List of all folders to scan
    active_model: '' // Filename or full path of the active GGUF model
};

// Ensure models directory exists
if (!fs.existsSync(DEFAULT_CONFIG.models_dir)) {
    try {
        fs.mkdirSync(DEFAULT_CONFIG.models_dir, { recursive: true });
    } catch (e) {
        console.error('[Config] Failed to create models directory:', e);
    }
}

export function loadLLMConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            // Migration/Cleanup: If bad config format, merge carefully
            const config = { ...DEFAULT_CONFIG, ...data };
            
            // Ensure model_search_paths exists (migration)
            if (!config.model_search_paths || !Array.isArray(config.model_search_paths)) {
                // Only default to MODELS_PATH if it exists
                config.model_search_paths = fs.existsSync(MODELS_PATH) ? [MODELS_PATH] : [];
            }
            
            // Ensure primary path in search paths if it exists and isn't included
            const primaryPath = config.models_dir || MODELS_PATH;
            if (fs.existsSync(primaryPath) && !config.model_search_paths.includes(primaryPath)) {
                config.model_search_paths.push(primaryPath);
            }
            
            return config;
        }
    } catch (e) {
        console.error('[Config] Failed to load LLM config:', e);
    }
    return DEFAULT_CONFIG;
}

export function saveLLMConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('[Config] Failed to save LLM config:', e);
        return false;
    }
}

export function getActiveModelPath() {
    const config = loadLLMConfig();
    return config.active_model;
}
