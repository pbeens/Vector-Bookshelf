const fs = require('fs');
const path = require('path');

// Target the unpacked resources folder
const src = path.join(__dirname, 'apps/api/prod_modules');
const dest = path.join(__dirname, 'apps/desktop/dist/win-unpacked/resources/api/node_modules');

console.log(`[Post-Build] Manually syncing API dependencies...`);
console.log(`From: ${src}`);
console.log(`To:   ${dest}`);

if (!fs.existsSync(src)) {
    console.error('[Post-Build] Error: Source node_modules not found. Run prepare-api.js first!');
    process.exit(1);
}

try {
    // Ensure destination parent exists
    if (!fs.existsSync(path.dirname(dest))) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
    }

    fs.cpSync(src, dest, { recursive: true, force: true, dereference: true });
    console.log('[Post-Build] Success: Dependencies synced. App is ready.');
} catch (e) {
    console.error('[Post-Build] Failure:', e);
    process.exit(1);
}
