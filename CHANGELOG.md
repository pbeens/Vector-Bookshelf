# Changelog

## [v0.8.0] - 2026-02-02

### Added

- **Interactive Library Graph**:
  - **A Whole New Way to See Your Library**: Introduced the Force-Directed Graph View. visualize connections between Books, Tags, and Categories in real-time.
  - **Physics Engine**: Nodes naturally cluster by topic. Drag nodes to rearrange them, or let the auto-optimizer find the perfect layout.
  - **Smart Filters**: "Hide" specific nodes to declutter the view (Right-Click -> Hide).
  - **Capture Tools**: Right-click the background to **Save Image** as PNG or **Copy to Clipboard**.
- **Bulk Export System**:
  - **List View**: Added a powerful export bar that appears when searching or filtering. Enter a folder path to instantly copy all matching books to a new location.
- **UX Improvements**:
  - **Graph Label Controls**: Granular toggles for Category vs Tag labels.
  - **Popup Stability**: "sticky" hover cards allow you to interact with book details without them vanishing.

### Fixed

- **Graph Power-Up**: Fixed a critical stability issue where background polling caused the graph to refresh/reset constantly.
- **Physics Calibration**: Corrected startup forces to ensure the graph always centers perfectly on screen (0,0), preventing "off-screen" clumping.
- **Visual Polish**: Z-Index fixes ensures Category labels always float above Tags.

## [v0.7.6] - 2026-02-02

### Added

- **Audible Alerts**:
  - Implemented a soft "Sine Bell" sound that plays when any scan (AI or Library) completes successfully.
- **UX Polish**:
  - **Rescan Categories Button**: Added visual "Disabled" state (opacity/cursor) and informative tooltips to explain why it's unavailable during active scans.

### Changed

- **Refactoring**:
  - Moved all local test/debug scripts (`debug*.js`, `check*.js`, etc.) to a dedicated `test_programs/` folder to clean up the project root.
  - Updated configuration to ignore these moved scripts while tracking the folder structure.

## [v0.7.5] - 2026-02-02

### Added

- **Scan Completion Indicator**:
  - "**Scan Complete**" Visuals: Scan buttons now turn Emerald Green upon completion.
  - **Interaction**: Clicking the green button clears the status and resets it to "Scan".
  - Applied to both **AI Data Scan** (Main UI) and **Scan Library** (Utilities).

### Changed

- **Development**:
  - Updated `.gitignore` to exclude local debug scripts (`debug*.js`, `check*.js`, `test*.js`).

## [v0.7.4] - 2026-02-01

### Added

- **Light/Dark Mode Toggle**:
  - Implemented a global theme switcher (Sun/Moon icon).
  - **Adaptive Contrast**: Refactored the entire UI color system to support high-readability Light Mode.
- **Accessibility Improvements**:
  - Improved button legibility and replaced low-contrast transparency effects.
- **Tech Stack Update**:
  - Migrated hardcoded Tailwind colors to **CSS Variables**.

## [v0.7.3] - 2026-02-01

### Added

- **Architecture Simplification**:
  - **Removed External LLM Support**: The system now runs exclusively on the embedded `node-llama-cpp` engine.
  - **Auto-Detect GPU**: Switched backend to "Auto-Detect" mode for GPU acceleration.
- **Smart AI Context**:
  - **VRAM Fallback System**: Automatically retries loading models at 8192, 4096, then 2048 context sizes if VRAM is insufficient.
  - **UI Indicator**: Added a live "Active Context Size" indicator.
- **UX Improvements**:
  - **One-Click Scanning**: Removed confirmation dialog for "AI Data Scan".

## [v0.7.2] - 2026-01-31

### Added

- **AI Performance Metrics**:
  - Scanning now tracks and displays average **Tokens Per Second** (TPS) during analysis.
  - Metrics are displayed in the scan button alongside ETA.

## [v0.7.1b] - 2026-01-31

### Fixed

- **Missing Book Cleaner**:
  - Fixed "System Offline" and missing progress updates during scan.
  - Scan loop now yields to the event loop, preventing server lockup.

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
