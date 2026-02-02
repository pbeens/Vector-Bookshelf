# Public Release Plan: Vector Bookshelf

This document outlines the strategy for preparing Vector Bookshelf for its first public release.

## 1. Project Cleanup

To provide a clean experience for new users, all development, debugging, and temporary files should be removed from the root directory.

### Scripts to Relocated/Removed

The following scripts should be moved to a `scripts/dev/` directory for historical reference or deleted:

- `debug-*.js` (Tagger, Greece, PDF, Targeted Scan, Taxonomy, Utility)
- `test-*.js` (EPUB, LM Studio, Server Logic, Utility)
- `check-*.js` (Book, DB, Queue, Counts, PDF)
- `inspect-*.js` (EPUB, Raw Metadata)
- `diagnose.js`, `find_scan_terms.js`, `get-one-book.js`, `trigger-metadata.js`, `verify-new-api.js`

### Temporary Files to Delete

- `*.log` (build_error, error, raw_meta_debug, server_debug_fixed)
- `SCAN_ERRORS.txt`
- `TMP_TAGS_AND_CATEGORIES.md`
- `library.db*` (Users should generate their own database on first run)

## 2. Documentation Improvements

### README.md Enhancements

- **Prerequisites Section:** Explicitly state the need for Node.js (v18+) and sufficient VRAM (8GB+ recommended).
- **Model Acquisition:** Provide clear instructions and links to HuggingFace for recommended GGUF models (e.g., Bartowski's Llama-3.2-3B-Instruct).
- **Troubleshooting:** Add a section for common `node-llama-cpp` installation issues on different OSs.
- **Visuals:** Add placeholders for screenshots or a demo GIF.

### New Documentation

- **CONTRIBUTING.md:** Define how others can contribute to the project.
- **SECURITY.md:** Basic security policy for local LLM usage.

## 3. Folder Reorganization

Proposed structure:

- `src/`: Source code (Maintained)
- `public/`: UI static assets (Maintained)
- `models/`: Destination for user-downloaded GGUF models (Empty in release)
- `scripts/dev/`: (Optional) Storage for the 50+ debug/test scripts identified above.

## 4. Release Checklist

1. [ ] Perform file cleanup.
2. [ ] Update `package.json` version to `1.0.0`.
3. [ ] Final audit of `README.md` instructions.
4. [ ] Zip and create a GitHub Release.
