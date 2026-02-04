const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const apiPackagePath = path.join(__dirname, 'apps/api/package.json');
const stagingDir = path.join(__dirname, 'apps/api/prod_modules');

console.log('[Prepare-API] Cleaning staging directory...');
if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

// Copy package.json to staging
fs.copyFileSync(apiPackagePath, path.join(stagingDir, 'package.json'));

console.log('[Prepare-API] Running NPM Install in staging directory...');
try {
    // Install ONLY production dependencies into the staging folder.
    // We explicitly target Electron 28.1.0 to ensure prebuild-install finds the right binaries
    // instead of trying to compile from source (which fails due to missing distutils in Python 3.12+)
    execSync('npm install --omit=dev --no-bin-links --target=28.1.0 --runtime=electron --dist-url=https://electronjs.org/headers', { 
        cwd: stagingDir, 
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' }
    });
    console.log('[Prepare-API] NPM Install complete.');

    console.log('[Prepare-API] Rebuilding native modules for Electron 28.1.0...');
    // We run electron-rebuild on the staging directory to ensure better-sqlite3 etc. are compatible
    // We use the local npx to ensure we use the project's version of electron-rebuild
    execSync('npx electron-rebuild -v 28.1.0', {
        cwd: stagingDir,
        stdio: 'inherit'
    });
    console.log('[Prepare-API] Success! Dependencies ready and rebuilt in apps/api/prod_modules/node_modules');

    // Generate Build Info for Title Bar
    const buildInfoPath = path.join(__dirname, 'apps/desktop/build-info.json');
    const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    const buildInfo = {
        timestamp: timestamp
    };
    fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
    console.log(`[Prepare-API] Generated build-info.json with timestamp: ${timestamp}`);
} catch (e) {
    console.error('[Prepare-API] Failed:', e.message);
    process.exit(1);
}
