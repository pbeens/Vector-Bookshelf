import fs from 'fs';
import path from 'path';
import { loadLLMConfig, saveLLMConfig } from '../config.js';

export const metadata = {
    id: 'ai-manager',
    name: 'AI Model Manager',
    description: 'Manage and select local GGUF models for the embedded AI engine.',
    actions: [
        { id: 'scan', label: 'Refresh Model List', type: 'scan' },
        { id: 'process', label: 'Set Active Model', type: 'execute' }
    ]
};

/**
 * Scans the models directory for GGUF files.
 */
export async function scan() {
    const config = loadLLMConfig();
    const modelsDir = config.models_dir || path.resolve('models');
    
    if (!fs.existsSync(modelsDir)) {
        return [];
    }

    const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.gguf'));
    
    return files.map(file => {
        const fullPath = path.join(modelsDir, file);
        const isActive = config.active_model === fullPath;
        const stats = fs.statSync(fullPath);
        const sizeGB = (stats.size / (1024 * 1024 * 1024)).toFixed(2);
        
        return {
            filepath: fullPath,
            name: file,
            size: `${sizeGB} GB`,
            reason: isActive ? 'ACTIVE' : 'Available'
        };
    });
}

/**
 * Sets the active built-in model.
 */
export async function process(selection) {
    const config = loadLLMConfig();
    const modelPath = Array.isArray(selection) ? selection[0] : selection;
    
    if (fs.existsSync(modelPath)) {
        config.active_model = modelPath;
        
        if (saveLLMConfig(config)) {
            return {
                success: [modelPath],
                failed: []
            };
        }
    }
    
    return {
        success: [],
        failed: [{ filepath: modelPath, error: 'File not found or failed to save.' }]
    };
}
