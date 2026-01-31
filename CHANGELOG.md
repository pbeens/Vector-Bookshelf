# Changelog

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
