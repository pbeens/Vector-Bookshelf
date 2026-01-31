# Development Log

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

- Added SQL `LIKE` query support for real-time searching.
- Implemented Frontend Debouncing to prevent API spam while typing.
- Added visual "Filter Chips" to show active search context.

## v0.5.2 - Pagination & Scaling (2026-01-30)

- Implemented client-side pagination to render 32,000+ books efficiently.
- Added "Persistent Scan State" (Headless Mode) to allow long-running scans to survive browser closes.
- Added "Export Errors" feature.
