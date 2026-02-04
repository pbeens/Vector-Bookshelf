---
description: Guide for fast desktop testing workflows (Dev Run & Pack Run).
---

# Fast Desktop Testing

This skill documents the "one-click" developer workflows for testing the Vector Bookshelf desktop app.

## Workflows

### 1. Desktop Dev Run (`.agent/workflows/desktop_dev_run.md`)

**When to use:**  

- Rapid UI testing/debugging.
- When you want to see changes immediately (if hot-reload is active) or just restart quickly.
- Uses `npm start` (which runs `electron .`) on the source files.

**Expected Behavior:**  

- Electron launches directly from the `apps/desktop` source.
- It loads the URL specified in `main.js` (usually `http://localhost:3001` or file path).

### 2. Desktop Pack Run (`.agent/workflows/desktop_pack_run.md`)

**When to use:**  

- Verifying the "production" behavior without building an installer.
- Testing `preload` scripts, file access, or `asar` packaging issues.
- Checking if new features work in the packaged environment.

**Expected Behavior:**  

- Runs `electron-builder --dir` to update the `dist/win-unpacked` folder.
- Launches `Vector Bookshelf.exe`.

## Troubleshooting

### Common Failures

1. **"npm run dev" missing**  
   - The workflow attempts to run `npm run dev`. If that script was removed, check `apps/desktop/package.json`.
   - **Fix:** Use `npm start` manually or restore the script.

2. **White Screen / API Error**  
   - Ensure the backend API is running (`npm run api` or `node src/server/index.js`) if usage requires it.
   - The desktop app often expects the API to be available at `http://localhost:3001`.

3. **"dist/win-unpacked" not found**  
   - If `Desktop Pack Run` fails to launch, the pack step might have failed.
   - Check the terminal output for `electron-builder` errors (file locks are common).
   - **Fix:** Close any running instances of the app and retry.

### If it fails completely

1. Open `apps/desktop/package.json`.
2. Inspect the `scripts` section.
3. Manually run the equivalent command:
   - Dev: `cd apps/desktop && npm start`
   - Pack: `cd apps/desktop && npm run pack`
