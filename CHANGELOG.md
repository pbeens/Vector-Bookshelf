# Changelog

All notable changes to Vector Bookshelf will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] - 2026-01-29

### Fixed

- **Failed AI Scans**: Books are no longer incorrectly marked as "scanned" when AI processing fails (e.g., LM Studio not running)
  - Added `/api/books/reset-failed-scans` endpoint to recover from this state
  - Run `fetch('http://localhost:3001/api/books/reset-failed-scans', { method: 'POST' })` in browser console to fix existing issues

### Changed

- Database files (`library.db`, `taxonomy.json`) are now excluded from version control via `.gitignore`

---

## [0.5.0] - 2026-01-29

### Added

- **Fiction/Non-Fiction Hierarchy**: Categories now automatically include Fiction or Non-Fiction as the first category based on genre
- **3-Category System**: Books can now have up to 3 categories (previously 2)
- **Fuzzy Tag Matching**: Case-insensitive and format-agnostic tag matching for better reliability
- **Author Name Parsing**: Proper handling of "Last, First" formatted author names
- **Adaptive Category System**: AI learns from your tags to create high-level categories
- **Manual Metadata Editing**: Click-to-edit inline editing for titles and authors with field locking
- **Bulk Export**: Export filtered books to any folder
- **Interactive Filtering**: Click authors and tags to filter the library
- **Clickable Filenames**: Open containing folder in Windows Explorer
- **Real-time Progress Tracking**: Live stats during scanning and processing

### Changed

- **Terminology**: Renamed "Master Tags" to "Categories" throughout the UI for clarity
- **AI Tagging**: AI no longer generates "Fiction" or "Non-Fiction" as tags (determined automatically during categorization)
- **Category Neutrality**: "Artificial-Intelligence" category can now be Fiction or Non-Fiction
- **Tag Pruning**: Redundant tags are automatically removed when they become categories

### Fixed

- Author names in "Last, First" format no longer split into two separate authors
- Tag matching now works regardless of spacing or hyphenation differences
- Eliminated duplicate "Fiction"/"Non-Fiction" appearing as both tags and categories
- **Failed AI Scans**: Books are no longer incorrectly marked as "scanned" when AI processing fails (e.g., LM Studio not running)
  - Added `/api/books/reset-failed-scans` endpoint to recover from this state

### Technical

- Implemented `CATEGORY_TYPE_MAP` for Fiction/Non-Fiction classification
- Added `updateBookTags()` function for tag pruning operations
- Improved `computeMasterTags()` with normalized tag matching
- Updated AI prompts to focus on specific genres and topics only
- Enhanced `parseAuthors()` with pattern detection for reversed names
- Added `/api/books/reset-failed-scans` endpoint to reset books with failed AI processing

---

## Development Notes

This is a **beta release** of Vector Bookshelf. The core functionality is complete and stable, but the project is still evolving based on user feedback and testing.

The application provides a complete workflow for:

1. Scanning a directory of EPUB/PDF books
2. Extracting metadata and generating AI-powered tags
3. Organizing books into hierarchical categories
4. Filtering, searching, and exporting your library

For detailed development history, see [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md).
