# Development Log

## Project Overview

**Vector Bookshelf** is a high-end research tool that treats a directory of books as a raw knowledge base, extracting metadata, relationship intelligence, and AI-derived classifications.

**Tech Stack:**

- Frontend: React (Vite) + Tailwind CSS v4
- Backend: Node.js (Express)
- Database: SQLite with WAL mode
- AI Integration: LM Studio (Local LLM Server)
- Core Libraries: `epub2`, `pdf-parse`

## Development Statistics

| Date | Session Objective | Estimated Hours |
| :--- | :--- | :--- |
| 2026-01-28 | Table layout, backend API fixes | 1.5h |
| 2026-01-29 | Feature Complete: Adaptive AI, Bulk Export, Manual Editing | 4.0h |

---

## 2026-01-30 - v0.5.2: Error Reporting & Stability Hardening

### New Features

1. **Error Reporting System**
    - **Backend:** Added `POST /api/books/export-errors` endpoint to scan database for `Error:...` or `Skipped:...` tags.
    - **File Output:** Generates `SCAN_ERRORS.txt` in the project root containing a detailed list of all failed files and reasons.
    - **Smart UI Button:**
        - "Export Errors" button appears **only** when errors exist and have not been dismissed.
        - Tracks dismissed errors via `localStorage`. Any *new* errors found in a subsequent scan will trigger the button to reappear.
        - Displays count of "New" errors (e.g., "Export Errors (3 New)").

### Critical Fixes

1. **"Stuck at 6/x" Progress Bug**
    - **Issue:** Scans appeared stuck because the backend failed to send progress events if `processBookContent` threw an error (caught in the `catch` block).
    - **Fix:** Refactored the scan loop in `index.js` to ensure the `progress` event is emitted **after** the `try/catch` block, guaranteeing UI updates for every single file regardless of success or failure.

2. **Infinite Retry Loop (Empty Content)**
    - **Issue:** Books returning `null` (e.g., PDFs with no text) were assigned empty tags `''`, causing them to be picked up again by the `content_scanned = 0 OR tags = ''` query.
    - **Fix:** Logic updated to explicit assign `Skipped: No Content` tag to these files, removing them from the queue permanently.

3. **Future Roadmap**
    - Added `SCAN_ERRORS.txt` to `.gitignore`.
    - Updated `README.md` with a "Future Roadmap" section, prioritizing Cloud/External LLM API support.

---

## 2026-01-29 - v0.5.1: Robustness & AI Integration Fixes

### Critical Fixes

1. **Dual Status Indicators**
    - Added distinct indicators for "System Online" (Backend) and "AI Server Online" (LM Studio).
    - Backend now independently checks `http://localhost:1234/v1/models` and reports status.
    - **Benefit:** Users can instantly see if the AI server is down without guessing why scans fail.

2. **"Poison Pill" Crash Protection**
    - Identified that corrupted EPUB files could crash the Node.js process via `uncaughtException` in library code.
    - Implemented a "Crash Handler" that catches these specific errors, **marks the file as 'Error' in the database**, and prevents infinite loops.
    - Added robust `try/catch` wrappers around `epub2` extraction logic.

3. **Cross-Origin Connection Fixes**
    - Switched absolute fetch URLs (`http://localhost:3001/...`) to relative paths (`/api/...`) in `App.jsx`.
    - Ensures all traffic routes correctly through the Vite proxy, resolving "stuck" scans caused by invisible CORS/Network blocks.

4. **Performance Optimization**
    - **Dynamic Polling:** Frontend now checks server health every **15 seconds** during active scans (vs 2s normally) to reduce CPU/Network contention.
    - **Silenced Logs:** Removed spammy `[HealthCheck]` logs from the terminal to make actual scan progress visible.

5. **UI Enhancements**
    - Added a **"Force Stop"** button (Red X) to the AI Scan interface to reset stuck UI states.
    - Fixed "0/0 Books" bug caused by incorrect SQL string quoting (`""` vs `''`).

---

## 2026-01-30 - v0.5.3: Search, Filtering & Robustness

### New Features

1. **Search & Filter System**
    - **Objective:** Allow users to find specific content in large libraries (32K+ books).
    - **Implementation:**
        - **Backend:** Updated `getAllBooks` to accept `search` and `year` params. Dynamic SQL construction using `LIKE` operators.
        - **Frontend:** Added Sticky Header with Search Input. Implemented **Debouncing** (500ms) to prevent API spam.
        - **Pagination:** Search results are fully paginated on the server side to maintain performance.

2. **Force Stop (Backend Implementation)**
    - **Issue:** The previous "Stop" button only hid the UI element; the server kept scanning endlessly.
    - **Fix:** Implemented `POST /api/scan/stop` endpoint that sets a global `scanState.active = false` flag, breaking the async loop immediately.

### Documentation Cleanup

- **Calibre References:** Removed mentions of Calibre from `gemini.md` to reinforce that Vector Bookshelf is a standalone, file-first system.
- **Future Roadmap:** Added task for "Duplicate Grouping" (merging PDF/EPUB versions).

---

## 2026-01-30 - v0.5.2: Error Reporting & Stability Hardening

### New Features

1. **Error Reporting System**
    - **Backend:** Added `POST /api/books/export-errors` endpoint to scan database for `Error:...` or `Skipped:...` tags.
    - **File Output:** Generates `SCAN_ERRORS.txt` in the project root containing a detailed list of all failed files and reasons.
    - **Smart UI Button:**
        - "Export Errors" button appears **only** when errors exist and have not been dismissed.
        - Tracks dismissed errors via `localStorage`. Any *new* errors found in a subsequent scan will trigger the button to reappear.
        - Displays count of "New" errors (e.g., "Export Errors (3 New)").

### Critical Fixes

1. **"Stuck at 6/x" Progress Bug**
    - **Issue:** Scans appeared stuck because the backend failed to send progress events if `processBookContent` threw an error (caught in the `catch` block).
    - **Fix:** Refactored the scan loop in `index.js` to ensure the `progress` event is emitted **after** the `try/catch` block, guaranteeing UI updates for every single file regardless of success or failure.

2. **Infinite Retry Loop (Empty Content)**
    - **Issue:** Books returning `null` (e.g., PDFs with no text) were assigned empty tags `''`, causing them to be picked up again by the `content_scanned = 0 OR tags = ''` query.
    - **Fix:** Logic updated to explicit assign `Skipped: No Content` tag to these files, removing them from the queue permanently.

3. **Future Roadmap**
    - Added `SCAN_ERRORS.txt` to `.gitignore`.
    - Updated `README.md` with a "Future Roadmap" section, prioritizing Cloud/External LLM API support.

## 2026-01-29 - Feature Complete: Adaptive AI & Power Tools

### New Features

1. **Adaptive AI Taxonomy (Master Tags)**
    - **Logic:** The system now "learns" from your specific tags to create high-level categories (e.g., "Culinary", "Hardware").
    - **Automation:** Categories are applied automatically during every scan using a persisted `taxonomy.json` mapping.
    - **Performance:** Optimized database writes with batched transactions for near-instant application.

2. **Bulk Export**
    - **UI:** New "Export Filtered Books" interface appears when active filters are present.
    - **Function:** Copies actual book files to any destination folder you specify, creating directories recursively.

3. **Manual Metadata Editing**
    - **Inline Editing:** Hover over any Title or Author to see a ✎ icon. Click to edit nicely in place.
    - **Instant Save:** Updates are written to the database immediately upon hitting Enter.

4. **Granular Scanning Controls**
    - **AI Data Scan:** Generating tags/summaries is now distinct from metadata extraction.
    - **Sync Properties:** New "SYNC PROP" button allows re-reading Title/Author/Year from the file without re-running AI.
    - **Rescan AI:** The "SCAN AI" button persists as a subtle "RESCAN" option for already-processed books.

5. **Advanced Filtering & UI**
    - **Author Filtering:** Authors are split into interactive chips. Filter by `Tag + Author` combinations.
    - **Uncategorized Detection:** "Rescan Master Tags" pulses amber when books have tags but no master category.

### Technical Improvements

- **Taxonomy Optimization:** Implemented **Incremental Learning** and **Batch Processing** (20 tags/batch).
  - *Result:* "Rescan Master Tags" is instant for existing tags, and robust against timeouts for new ones.
- **Metadata Locking:** Manual edits are protected by a `locked_fields` database column, preventing overwrite by subsequent scans.
- **Database:** Added `runTransaction` helper for atomic updates.

- Implemented `taxonomy.js` for persistent category learning.
- Fixed accessibility issues with hover-state buttons.
| **Total** | | **4.2h** |

---

## Development Iterations

### Session: 2026-01-29 - Category System Refinement

**Objective:** Improve the taxonomy system with Fiction/Non-Fiction hierarchy, eliminate redundant tags, and enhance user clarity by renaming "Master Tags" to "Categories".

#### Key Changes

1. **Fiction/Non-Fiction Hierarchy**
   - Implemented automatic Fiction/Non-Fiction categorization as the first category
   - Created `CATEGORY_TYPE_MAP` to map specific categories to Fiction or Non-Fiction
   - Categories now display as: `[Fiction/Non-Fiction], [Category 1], [Category 2]`
   - Increased category limit from 2 to 3 per book
   - Made "Artificial-Intelligence" category neutral (can be Fiction or Non-Fiction)

2. **Eliminated Redundant Tags**
   - Updated AI prompt to NOT generate "Fiction" or "Non-Fiction" as tags
   - These are now determined automatically during "Rescan Categories"
   - Implemented tag pruning logic to remove redundant tags when they become categories
   - **Result:** No more confusion from seeing "Fiction" as both a tag and category

3. **Terminology Improvement**
   - Renamed "Master Tags" to "Categories" throughout the UI
   - Updated button text: "Rescan Master Tags" → "Rescan Categories"
   - Updated tooltips and comments for clarity
   - **Database column remains `master_tags` internally to avoid migration**

4. **Author Parsing Fix**
   - Fixed parsing of "Last, First" formatted author names
   - Implemented pattern detection for single authors in reversed format
   - "Gaiman, Neil" now correctly displays as "Neil Gaiman" instead of two separate authors
   - Multiple authors still split on semicolons, ampersands, or " and "

5. **Tag Matching Improvements**
   - Implemented fuzzy tag matching (case-insensitive, space/hyphen agnostic)
   - Resolves mismatches between AI-generated keys and database tags
   - Example: "AI Agents" now matches "Ai-Agents" in taxonomy.json

#### Technical Details

**Backend Changes:**

- **[src/server/taxonomy.js](file:///d:/My%20Documents/GitHub/Vector-Bookshelf/src/server/taxonomy.js)**
  - Added `CATEGORY_TYPE_MAP` to define Fiction vs Non-Fiction categories
  - Updated `computeMasterTags()` to enforce Fiction/Non-Fiction as first category
  - Implemented normalized tag matching for flexible lookups
  - Added tag pruning logic to remove redundant tags
  - Removed "Artificial-Intelligence" from type map (now neutral)

- **[src/server/tagger.js](file:///d:/My%20Documents/GitHub/Vector-Bookshelf/src/server/tagger.js)**
  - Updated `SYSTEM_PROMPT` to exclude "Fiction"/"Non-Fiction" from tag generation
  - AI now focuses on specific genres and topics only
  - Updated example JSON to reflect new tag structure

- **[src/server/db.js](file:///d:/My%20Documents/GitHub/Vector-Bookshelf/src/server/db.js)**
  - Added `updateBookTags()` function for tag pruning operations

**Frontend Changes:**

- **[src/App.jsx](file:///d:/My%20Documents/GitHub/Vector-Bookshelf/src/App.jsx)**
  - Updated button text and tooltips to say "Categories"
  - Fixed `parseAuthors()` to handle "Last, First" format
  - Implemented pattern detection for reversed author names

#### Design Rationale

**Why Fiction/Non-Fiction First?**

- Provides immediate context about book type
- Matches how users mentally categorize books
- Enables quick filtering by fiction vs non-fiction

**Why Remove Fiction/Non-Fiction from Tags?**

- Eliminates redundancy and user confusion
- Tags should be specific (e.g., "Science-Fiction", "Mystery")
- Categories provide the high-level classification

**Why "Categories" Instead of "Master Tags"?**

- More intuitive and user-friendly terminology
- Clearer distinction from specific tags
- Better aligns with common library organization concepts

---

### Session: 2026-01-29 - Documentation Infrastructure

**Objective:** Establish comprehensive documentation infrastructure with development logging, skills, and workflows to maintain project documentation systematically.

#### Key Changes

1. **Development Log Creation**
   - Created `DEVELOPMENT_LOG.md` to track all development iterations
   - Documented previous session's table layout improvements
   - Established template for future session entries
   - Included architecture decisions and design rationale

2. **Skills System**
   - Created `skills/update-docs/SKILL.md` with detailed documentation guidelines
   - Created `skills/wipe-db/SKILL.md` documenting database reset process
   - Established skills as reference documentation for complex tasks

3. **Workflow Automation**
   - Created `.agent/workflows/update-docs.md` for systematic documentation updates
   - Created `.agent/workflows/wipe-db.md` for automated database cleanup
   - Implemented `/update-docs` and `/wipe-db` slash commands
   - Added `// turbo-all` annotation for auto-execution of safe commands

4. **Documentation Standards**
   - Established consistent formatting for session entries
   - Created templates for documenting frontend/backend changes
   - Defined best practices for keeping docs synchronized with code

#### Technical Details

**Documentation Structure:**

- `DEVELOPMENT_LOG.md` - Chronological development history
- `README.md` - User-facing project documentation
- `skills/` - Detailed skill reference documentation
- `.agent/workflows/` - Executable workflow definitions

**Workflow System:**

- Workflows define step-by-step processes
- Skills provide detailed instructions and context
- Slash commands trigger workflows (e.g., `/update-docs`, `/wipe-db`)
- Auto-execution enabled via `// turbo` and `// turbo-all` annotations

1. **Clickable Filename Feature Fix**
   - Fixed ES module/CommonJS mismatch causing "require is not defined" error
   - Changed `require('child_process')` to ES6 `import { exec } from 'child_process'`
   - Implemented "fire and forget" pattern for Windows Explorer command
   - Added proper error handling and user feedback in frontend
   - Resolved issue where Explorer returned non-zero exit codes on success

2. **README Improvements**
   - Updated LM Studio configuration section with GPU-specific model recommendations
   - Documented Gemma 3 12B as tested model for 12GB VRAM
   - Added model recommendations for 6GB, 8GB, 12GB, and 16GB+ VRAM configurations
   - Clarified that any OpenAI-compatible local LLM works

#### Technical Details

**Backend Changes ([src/server/index.js](file:///D:/My%20Documents/GitHub/Vector-Bookshelf/src/server/index.js)):**

- Added `import { exec } from 'child_process'` at module level
- Removed `require()` call from inside `/api/open-folder` endpoint
- Implemented immediate success response with async explorer execution
- Added logging to track explorer command execution

**Frontend Changes ([src/App.jsx](file:///D:/My%20Documents/GitHub/Vector-Bookshelf/src/App.jsx)):**

- Made click handler async for proper error handling
- Added try/catch block with console logging
- Implemented user-friendly error alerts
- Added response validation

**Windows Explorer Quirk:**

- `explorer.exe /select` command returns non-zero exit codes even on success
- Solution: Send HTTP response immediately, execute explorer command asynchronously
- This prevents false error messages while still opening the folder correctly

---

### Session: 2026-01-28 - Improving Table Layout

**Objective:** Refine the display of book data in a table, focusing on optimizing column widths, enabling text wrapping, ensuring readability, and adding interactive features.

#### Key Changes

1. **Column Width Optimization**
   - Adjusted table column widths for better data presentation
   - Implemented responsive column sizing for different data types

2. **Text Wrapping for Long Entries**
   - Added text wrapping for tags column to handle multiple tags
   - Enabled wrapping for long filenames to prevent horizontal overflow
   - Ensured readability of wrapped text against dark backgrounds

3. **Visual Improvements**
   - Enhanced contrast and readability for dark theme
   - Improved typography for better text legibility
   - Refined spacing and padding for cleaner layout

4. **Interactive Features**
   - **Clickable Filenames:** Implemented functionality where clicking a filename opens its containing folder in the file explorer
   - Added backend API endpoint to handle folder opening requests
   - Integrated frontend click handlers with backend API

#### Technical Details

**Frontend Changes:**

- Modified React components to handle click events on filenames
- Updated CSS for better table styling and text wrapping
- Implemented proper event handling for folder navigation

**Backend Changes:**

- Created new API endpoint for opening folders in file explorer
- Implemented Node.js `child_process` integration to launch file explorer
- Added proper error handling for file system operations

---

## Architecture Decisions

### Phase-Based Processing

The application uses a three-phase approach to ensure performance and data integrity:

1. **Phase 1: Ingestion (Scan)**
   - Recursive directory scanning for `.epub` and `.pdf` files
   - Idempotent database operations using `INSERT OR IGNORE`
   - Non-blocking UI during scan operations

2. **Phase 2: Metadata Extraction**
   - Fault-tolerant parsing with 5-second timeout per file
   - Quality heuristics to filter junk metadata
   - Intelligent fallback to filename when metadata is missing

3. **Phase 3: AI-Based Tagging**
   - Content extraction (first 5,000 characters from key sections)
   - LLM integration via LM Studio for tag generation
   - Strict Pascal-Case-With-Hyphens formatting for tags
   - Automated summary generation

### Database Design

- **SQLite with WAL Mode:** Chosen for robustness and concurrent read/write operations
- **Idempotent Operations:** Ensures safe re-scanning without data duplication
- **Efficient Indexing:** Optimized for quick lookups and filtering

### AI Integration Strategy

- **Local LLM (LM Studio):** Privacy-focused, no external API calls
- **Recommended Model:** Llama 3.1 8B Instruct (GGUF Q6_K or higher)
- **Content Sampling:** First 5,000 characters for efficient processing
- **Structured Output:** Enforced formatting for consistent tag presentation

---

## Maintenance & Workflows

### `/wipe-db` Workflow

Created automated workflow for database cleanup and server restart:

1. Stop all Node.js processes
2. Delete database files (`library.db`, `library.db-wal`, `library.db-shm`)
3. Restart backend server
4. Restart frontend server

**Purpose:** Enables quick testing cycles and clean slate development

### `/update-docs` Workflow

Created systematic documentation update workflow:

1. Review recent changes in codebase
2. Add new session entry to `DEVELOPMENT_LOG.md`
3. Update `README.md` with new features or changes
4. Verify consistency between documents
5. Validate links and examples

**Purpose:** Maintains synchronized, accurate documentation throughout development

---

## Future Considerations

### UI/UX Improvement Roadmap

Based on comprehensive UX analysis, the following improvements are planned to enhance space efficiency, task prioritization, and interaction flow:

#### Phase 1: High-Impact Changes (Priority)

1. **Collapsible Scan Section**
   - Collapse scan area by default when books exist in library
   - Convert to slim toolbar or slide-down drawer
   - Remember collapsed state in localStorage
   - Auto-collapse after successful scan completion
   - **Impact:** ~60% more vertical space for book table

2. **Interactive Tag Navigation**
   - Make tags clickable to filter the library
   - Show active filters in removable filter chips
   - Enable multi-tag filtering
   - **Impact:** Transforms passive data into primary navigation

3. **Sticky Library Header**
   - Keep "Library (count)" and action buttons visible while scrolling
   - Maintain access to Extract Metadata and Generate AI Tags
   - **Impact:** Always-accessible controls for large libraries

4. **Hover-Based File Actions**
   - Show file actions only on row hover (open folder, copy path, open file)
   - Reduce visual noise in default view
   - **Impact:** Cleaner, more scannable rows

#### Phase 2: Polish & Power Features

1. **Quick Filter/Search Bar**
   - Search by title, author, or tags
   - Filter by year range
   - Real-time results as you type
   - **Impact:** Essential for libraries with 100+ books

2. **Visual Density Adjustments**
   - Reduce vertical padding in table rows
   - Lower contrast on secondary text (author, year, filepath)
   - Increase contrast on primary elements (title, active tags)
   - Show more books per screen
   - **Impact:** Better information density without losing readability

3. **Row-Level Actions**
   - Extract metadata for individual books
   - Regenerate tags for specific items
   - Avoid unnecessary batch operations
   - **Impact:** More precise control over processing

#### Phase 3: Advanced Features

1. **Tag Sidebar with Analytics**
   - Display most-used tags with counts
   - Enable multi-select tag filtering
   - Show tag distribution across library
   - **Impact:** Better library discovery and organization

2. **Column Customization**
   - Resizable columns
   - Show/hide column toggles
   - Save column preferences
   - **Impact:** Personalized workspace

3. **Multi-Select Operations**
    - Select multiple rows with checkboxes
    - Contextual action bar for batch operations
    - Selective metadata extraction or tag regeneration
    - **Impact:** Efficient bulk operations on subsets

### Other Potential Enhancements

- Book relationship mapping and visualization
- Export functionality for research notes
- Custom tag taxonomy management
- Reading progress tracking
- Annotation and note-taking features
- Right-click context menus for power users

### Performance Optimizations

- Parallel metadata extraction
- Incremental AI tagging
- Database query optimization
- Frontend virtualization for large libraries (1000+ books)
- Lazy loading for table rows

---

## Development Environment

### Setup Requirements

1. Node.js and npm installed
2. LM Studio running on port 1234
3. Recommended: 16GB GPU for optimal LLM performance

### Running the Application

```bash
# Install dependencies
npm install

# Start backend
node src/server/index.js

# Start frontend (separate terminal)
npm run dev
```

### Access Points

- Frontend: <http://localhost:5173/>
- Backend API: <http://localhost:3001>

---

## Notes

- All development follows idempotent principles for safe re-execution
- Error handling is comprehensive to prevent corrupt files from blocking operations
- UI remains responsive during long-running operations
- Local AI processing ensures privacy and offline capability

---

**Last Updated:** 2026-01-29
