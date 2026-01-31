# Development Log

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
