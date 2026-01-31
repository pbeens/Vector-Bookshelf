# Changelog

## [v0.7.1a] - 2026-01-31

### Fixed

- **Filtered Scan**:
  - Scanning a filtered list now correctly forces a re-scan of "Error" or "Skipped" items, allowing retry of failed books.
  - Increased server payload limit to 50MB to prevent crashes when scanning large filtered sets (e.g., 900+ items).

## [v0.7.1] - 2026-01-31

### Added

- **AI Scan ETA**: Real-time Estimated Time Remaining display for AI scanning operations.
- **Robustness**: Improved scan state synchronization to prevent "disappearing" status on page refresh.

## [v0.7.0] - 2026-01-31

### Added

- **Utilities Framework**: A new extensible system for administrative tasks.
- **Missing Book Cleaner**: A utility to scan for and remove books from the database that no longer exist on the file system.
- **Progress Reporting**: Real-time progress bars for long-running utility scans.

## [v0.6.1] - 2026-01-31

### Added

- **Sortable Columns**: Click table headers to sort by Title, Author, Year, or File (Asc/Desc).
- **Year Interaction**:
  - **Filter**: Click a year (e.g., 2023) to show only books from that year.
  - **Edit**: Hover over the year column to manually edit the publication date.

### Fixed

- **UI Polish**: Removed browser-native spinner arrows from proper numeric inputs for a cleaner look.
- **Filter Visibility**: Fixed an issue where the Year filter chip would not appear unless other filters were active.

## [v0.6.0] - 2026-01-31

### Added

- **Taxonomy Doctor UI**: A new tool (Stethoscope icon) to manage your library's organization.
  - **Rules Editor**: Write custom logic in plain text (e.g., "Python -> Programming, not Snake").
  - **Apply Hierarchies**: Instantly apply parent tags (e.g., Machine Learning -> AI).
  - **Fix Ambiguity**: Reset specific tags in bulk to re-scan them with your new rules.
- **Robustness**: Added 15s timeout to file parser to prevent "Stuck Scans" on corrupt books.
- **Visuals**: Modern "Glassmorphism" UI updates for the new modals.

### Fixed

- Fixed an issue where "Reset Tag" would sometimes fail to find tags due to whitespace differences.
- Fixed a bug where the library view wouldn't refresh immediately after applying rules.

## [v0.5.4] - 2026-01-31

### Added

- **Tag Sieve**: New logic layer to normalize tags (lowercase, hyphenated) before they hit the database.
- **Educational Docs**: Added `PROGRAMMING_CONCEPTS.md`.

## [v0.5.3] - 2026-01-30

### Added

- **Search & Filter**: Real-time filtering by Title, Author, Year, and Tags.
- **Active Filter Chips**: Visual indicators for current filters.

## [v0.5.2] - 2026-01-30

### Added

- **Pagination**: Added efficient pagination (100/500/1000 items) to handle large libraries (32k+ books) without lag.
- **Status Indicators**: Added Server and AI connection status LEDs in the header.
- **Error Reporting**: New "Export Errors" button to generate a report of failed file scans.
- **Persistence**: AI Scan now saves its state, allowing it to resume after server restarts.
