import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.resolve('llm_config.json');

const DEFAULT_CONFIG = {
    models_dir: path.resolve('models'), // Default models folder
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
            return { ...DEFAULT_CONFIG, ...data };
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
