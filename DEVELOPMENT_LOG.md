# Development Log

## v0.7.5 - UX Polish & Cleanup (2026-02-02)

### Features Added

- **Scan Completion Indicators**:
  - Implemented visual feedback for successful scans. Buttons now turn green and display "Scan Complete".
  - Created a "Click to Clear" interaction pattern to reset the button state without reloading.
  - Applied to main `App.jsx` (AI Scan) and `Utilities.jsx` (File Scan).

### Maintenance

- **Git Hygiene**:
  - Updated `.gitignore` to explicitly exclude `debug*.js`, `check*.js`, and `test*.js` to prevent clutter from local verification scripts.

## v0.7.4 - UI Polishing & Theming (2026-02-01)

### Features Added

- **Light/Dark Mode Toggle**:
  - Implemented a global theme switcher (Sun/Moon icon).
  - **Adaptive Contrast**: Refactored the entire UI color system to support high-readability Light Mode (e.g., solid white backgrounds for pills instead of transparent black) while maintaining the premium Dark Mode aesthetic.
  - **Persistence**: Theme preference is saved to `localStorage`.
- **Accessibility Improvements**:
  - Replaced low-contrast transparency effects with solid, distinct colors in Light Mode for critical actions (Search, Scan, Export).
  - Improved button legibility by switching to bold, pastel-on-white color schemes in Light Mode.
- **Tech Stack Update**:
  - Migrated hardcoded Tailwind colors to **CSS Variables** (`--color-background`, `--color-surface`, etc.) in `index.css` for instant, flicker-free theme switching.

## v0.7.3 - Backend Optimization & Robustness (2026-02-01)

### Features Added

- **Architecture Simplification**:
  - **Removed External LLM Support**: The system now runs exclusively on the embedded `node-llama-cpp` engine, removing potential network/compatibility issues with external servers like LM Studio.
  - **Auto-Detect GPU**: Switched backend to "Auto-Detect" mode for GPU acceleration, improving compatibility with NVIDIA/CUDA setups.
- **Smart AI Context**:
  - **VRAM Fallback System**: Implemented a resilient context loading strategy. The system attempts to load at **8192** tokens. If VRAM is insufficient, it automatically retries at **4096**, then **2048**, preventing server crashes on lower-end hardware.
  - **UI Indicator**: Added a live "Active Context Size" indicator (e.g., `8192 active ctx`) to the AI status pill in the top bar.
- **UX Improvements**:
  - **One-Click Scanning**: Removed the confirmation dialog for the "AI Data Scan" button for faster workflow.
  - **High-Contrast UI**: Tuned the colors of status indicators for better readability on dark backgrounds.

### Implementation Details

- **Backend**:
  - Refactored `tagger.js` to internalize the context retry logic and export `getActiveContextSize()`.
  - Refactored `taxonomy.js` to reuse the optimized `getLlamaManager` from `tagger.js`, eliminating duplicate model loading code.
  - Updated `/api/health` to expose `ai_context_size`.
- **Frontend**:
  - Updated `App.jsx` to consume and display the real-time context size from the health check.

## v0.7.2 - AI Performance Metrics (2026-01-31)

### Features Added

- **Token Tracking**:
  - Instrumented `tagger.js` to extract `usage.total_tokens` from LM Studio responses.
  - Updated `index.js` to maintain a cumulative `totalTokens` count and propagate it via SSE.
  - Added real-time TPS calculation in the Frontend.

## v0.7.1b - Missing Book Cleaner Fix (2026-01-31)

### Fixed

- **Event Loop Blocking**: The missing book scanner was running a tight synchronous loop, causing the server to stop responding to health checks. Added `setImmediate` yields every 50 items.

## v0.7.1a - Scanning Fixes (2026-01-31)

### Fixed

- **Filtered Scan**:
  - Fixed logic preventing retry of "Error" items when scanning a filtered selection.
  - Increased `express.json` limit to **50MB** to handle large `targetFilepaths` arrays (previously failing on >800 items).

## v0.7.1 - AI Scan ETA (2026-01-31)

### Features Added

- **AI Scan ETA**:
  - Shows estimated time remaining for AI scanning operations.
  - Calculation based on rolling average of processed items vs total.
  - Persists across page reloads by syncing with server state.

### Implementation Details

- **Backend**:
  - `scanState` now tracks `startTime`.
  - `/api/scan/status` and SSE events include `startTime` payload.
- **Frontend**:
  - `App.jsx` calculates ETA: `(Total - Processed) * (Elapsed / Processed)`.
  - Added robust fallback: if SSE reconnects or polling runs, it uses the server's `startTime` instead of resetting to `Date.now()`.

## v0.7.0 - Utilities & Maintenance (2026-01-31)

### Features Added

- **Utilities Framework**:
  - Implemented a backend module loader `src/server/utilities/manager.js` to dynamically load utility scripts.
  - Created a standardized interface for utilities (`metadata`, `scan`, `process`).
- **Missing Book Cleaner**:
  - Scans the database for file paths that do not exist on disk.
  - Allows bulk deletion of "Ghost Books".
- **Progress Reporting**:
  - Implemented Server-Sent Events (SSE) for utility scans.
  - Added a visual progress bar to the Frontend Utilities UI.

### Implementation Details

- **Backend**:
  - Refactored `index.js` to delegate utility management to a dedicated manager.
  - Updates `missing_books.js` to support synchronous progress callbacks during the file check loop.
- **Frontend**:
  - `Utilities.jsx` now consumes `text/event-stream` responses to update the UI in real-time without polling.

## v0.6.1 - UI Power-Ups (2026-01-31)

### Features Added

- **Year Management**:
  - **Filtering**: Click any year in the table (e.g., "1999") to filter the view to that specific year. Added a "Year" chip to the active filters bar.
  - **Editing**: Hover over the Year cell to see the edit pencil. Allows manual correction of publication years directly in the table.
- **Sortable Columns**:
  - Added sorting support for **Title**, **Author**, **Year**, and **File** columns.
  - Sorting is applied *after* filtering but *before* pagination, ensuring correct order across pages.
  - Visual indicators (↑/↓) added to column headers.

### Implementation Details

- **Frontend**:
  - Added `sortConfig` state to `App.jsx`.
  - Updated `filteredBooks` memo to chain `.sort()` before pagination slice.
  - Added `activeYearFilter` state and integrated it into the filter logic.
- **Backend**:
  - Updated `src/server/db.js` allowlist to include `publication_year` for manual updates.

## v0.6.0 - Taxonomy Doctor & Robustness (2026-01-31)

### Features Added

- **Taxonomy Logic System (`tagging_rules.md`)**:
  - Implemented `Apply Hierarchies` (Logic Rules) vs `Re-Scan Context` (Ambiguity Rules).
  - Created "Taxonomy Doctor" UI (Stethoscope Icon).
  - Built dedicated "Large Rules Editor" modal for comfortable rule editing.
  - Added specific SQL logic to handle tag updates ensuring spaces are handled correctly.

- **Scan Robustness**:
  - **Timeout Protection**: Added 15-second timeout to EPUB/PDF text extraction. Prevents single corrupt files from hanging the entire queue.
  - **Refresh Logic**: Frontend now auto-refreshes book list after "Reset Tag" or "Apply Hierarchy" actions.

### Implementation Details

- **Backend**:
  - `POST /api/taxonomy/apply-implications`: Parses `tagging_rules.md` for "If X, ensures Y" logic.
  - `POST /api/taxonomy/re-eval`: Resets metadata for books with specific tags.
  - Fix: SQLite tag matching changed to `REPLACE(tags, ' ', '')` to handle CSV spacing variations (`Tag, Tag` vs `Tag,Tag`).
- **Frontend**:
  - Refactored `TaxonomyDoctor` modal to use a separate `showRulesEditor` state.
  - Updated UI copy to clearly explain the difference between "Instant" and "Deep Scan" operations.

### Debugging

- Fixed `Matplotlib` reset failing due to whitespace in CSV storage.
- Fixed "Stuck Scan" on *The Fated Sky* by identifying EPUB parser hang and adding defensive timeout.

## v0.5.4 - Tag Sieve Optimization (2026-01-31)

### Features Added

- **Tag Sieve Layer**:
  - Implemented `normalizeTag` to enforce lowercase/hyphenated format before DB insertion.
  - Added regex rules to classify tags (e.g., detecting Dates vs Code).
- **Educational Resources**:
  - Created `PROGRAMMING_CONCEPTS.md` to explain the codebase to students.

### Debugging

- Fixed "Infinite Learning Loop" where the Adaptive Taxonomy would re-learn the same tags forever due to case sensitivity mismatches.
- Solved SQL "no such column" crash during migration.

## v0.5.3 - Search & Filter (2026-01-30)

### Features Added

- **Search & Filter**:
  - Added SQL `LIKE` query support for real-time searching.
  - Implemented Frontend Debouncing to prevent API spam while typing.
  - Added visual "Filter Chips" to show active search context.

## v0.5.2 - Pagination & Scaling (2026-01-30)

### Features Added

- **Pagination & Scaling**:
  - Implemented client-side pagination to render 32,000+ books efficiently.
  - Added "Persistent Scan State" (Headless Mode) to allow long-running scans to survive browser closes.
  - Added "Export Errors" feature.
