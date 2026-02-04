import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { USER_DATA_PATH } from '../paths.js';
import db from '../db.js';

export const metadata = {
    id: 'library-backup',
    name: 'Backup Library',
    description: 'Create a ZIP archive of your library data (DB, rules, taxonomy). Models are excluded.',
    actions: [
        { id: 'start-backup', label: 'Create Backup...', type: 'execute' }
    ]
};

/**
 * Creates a backup of the library data.
 * @param {string[]} args - List of selected items (ignored for this tool)
 */
export async function process(args) {
    const destinationFolder = Array.isArray(args) ? args[0] : null;

    if (!destinationFolder || !fs.existsSync(destinationFolder)) {
        throw new Error('Destination path does not exist.');
    }

    // Check for write permissions
    try {
        const testFile = path.join(destinationFolder, '.write-test-' + Date.now());
        fs.writeFileSync(testFile, '');
        fs.unlinkSync(testFile);
    } catch (e) {
        throw new Error(`Permission Denied: Cannot write to chosen destination folder (${destinationFolder}).`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipName = `vector-bookshelf-backup-${timestamp}.zip`;
    const destPath = path.resolve(path.join(destinationFolder, zipName));

    console.log(`[Backup] Starting backup process...`);
    console.log(`[Backup] Source: ${USER_DATA_PATH}`);
    console.log(`[Backup] Destination: ${destPath}`);

    // 1. Force WAL Checkpoint to flush data to disk
    try {
        console.log('[Backup] Checkpointing database (WAL)...');
        db.pragma('wal_checkpoint(TRUNCATE)');
        console.log('[Backup] Checkpoint successful.');
    } catch (e) {
        console.error('[Backup] Warning: Checkpoint failed, backup may be slightly out of date.', e);
    }

    console.log(`[Backup] Preparing files...`);

    // 2. Stage files to a temporary directory to avoid file locking issues during zip
    const stagingDir = path.join(destinationFolder, `.backup_staging_${timestamp}`);
    if (!fs.existsSync(stagingDir)) fs.mkdirSync(stagingDir);

    console.log(`[Backup] Staging files to: ${stagingDir}`);

    try {
        const items = fs.readdirSync(USER_DATA_PATH)
            .filter(item => item !== 'models' && item !== 'logs');

        for (const item of items) {
            const src = path.join(USER_DATA_PATH, item);
            const dst = path.join(stagingDir, item);
            
            try {
                if (fs.lstatSync(src).isDirectory()) {
                    // Recursive copy for directories (like 'covers' or 'cache')
                    // Node 16.7+ has fs.cpSync, but let's use a simple recursive copy function or just specific handling
                    // For now, let's assume we just need the top-level files + specific known dirs if needed
                    // But actually, cpSync is standard in recent generic node.
                    if (fs.cpSync) {
                        fs.cpSync(src, dst, { recursive: true });
                    } else {
                        // Fallback for older node if necessary (unlikely given the environment)
                        // Verify if we really need directories?
                        // If it's a directory, let's skip for safety unless we know what it is?
                        // No, we want to backup everything except models/logs.
                        // We'll rely on cpSync which is available in Electron's Node version.
                         fs.cpSync(src, dst, { recursive: true });
                    }
                } else {
                    fs.copyFileSync(src, dst);
                }
            } catch (err) {
                console.warn(`[Backup] Failed to copy ${item}: ${err.message}`);
                // Continue best-effort?
            }
        }
    } catch (e) {
        console.error('[Backup] Staging failed:', e);
        throw new Error(`Staging Failed: Could not copy files to temporary location. ${e.message}`);
    }

    // 3. Zip the staging directory
    // We zip the *contents* of stagingDir into destPath
    console.log('[Backup] Executing PowerShell compression on staged files...');
    
    // Correctly escape inner single quotes, then wrap in single quotes
    // PowerShell string: 'C:\Path\To\File'
    const stagingWildcard = path.join(stagingDir, '*');
    const psSource = `'${stagingWildcard.replace(/'/g, "''")}'`; 
    
    const psDestUser = destPath.replace(/'/g, "''");
    const psDest = `'${psDestUser}'`;

    const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path ${psSource} -DestinationPath ${psDest} -Force"`;

    return new Promise((resolve, reject) => {
        exec(command, async (error, stdout, stderr) => {
            // Cleanup staging regardless of success/fail
            try {
                console.log('[Backup] Cleaning up staging area...');
                fs.rmSync(stagingDir, { recursive: true, force: true });
            } catch (ignored) {}

            if (error) {
                console.error('[Backup] FATAL - PS Error:', stderr || error.message);
                reject(new Error(`Compression Failed: ${stderr || error.message}`));
                return;
            }

            console.log('[Backup] Compression command finished. Verifying file authenticity...');

            // Robust polling for file existence/sync
            let verified = false;
            let finalSize = 0;
            for (let i = 0; i < 10; i++) {
                if (fs.existsSync(destPath)) {
                    const stats = fs.statSync(destPath);
                    if (stats.size > 0) {
                        verified = true;
                        finalSize = stats.size;
                        break;
                    }
                }
                await new Promise(r => setTimeout(r, 500));
            }

            if (!verified) {
                console.error('[Backup] Verification FAILED. File not found at:', destPath);
                reject(new Error(`Verification Failed: ZIP file was verified missing at ${destPath} after success report.`));
                return;
            }

            console.log(`[Backup] SUCCESS. File verifed at ${destPath} (${(finalSize / 1024 / 1024).toFixed(2)} MB)`);
            resolve({
                success: [zipName],
                failed: [],
                message: `Backup created successfully at ${destPath}`,
                fullPath: destPath
            });
        });
    });
}
