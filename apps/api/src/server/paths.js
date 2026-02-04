import path from 'path';
import fs from 'fs';
import os from 'os';

function getAppUserDataPath() {
    // 1. If running in Electron, we might receive this via process.env or just rely on standard OS paths
    // For now, let's stick to standard OS convention:
    // Windows: %APPDATA%/VectorBookshelf
    // Mac: ~/Library/Application Support/VectorBookshelf
    // Linux: ~/.config/VectorBookshelf
    
    const appName = 'VectorBookshelf';
    let base;

    if (process.platform === 'win32') {
        base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    } else if (process.platform === 'darwin') {
        base = path.join(os.homedir(), 'Library', 'Application Support');
    } else {
        base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    }

    const userDataDir = path.join(base, appName);
    
    // Ensure it exists
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    return userDataDir;
}

export const USER_DATA_PATH = process.env.USER_DATA_PATH || getAppUserDataPath();
export const DB_PATH = path.join(USER_DATA_PATH, 'library.db');
export const MODELS_PATH = path.join(USER_DATA_PATH, 'models');
export const LOGS_PATH = path.join(USER_DATA_PATH, 'logs');
export const TAXONOMY_PATH = path.join(USER_DATA_PATH, 'taxonomy.json');
export const RULES_PATH = path.join(USER_DATA_PATH, 'tagging_rules.md');

// Ensure subdirs exist
if (!fs.existsSync(MODELS_PATH)) fs.mkdirSync(MODELS_PATH);
if (!fs.existsSync(LOGS_PATH)) fs.mkdirSync(LOGS_PATH);
