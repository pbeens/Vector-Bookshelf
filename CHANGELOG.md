# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-04

### Public Baseline Release

Vector Bookshelf version 1.0.0 marks the first official public release. This version establishes a robust foundation for local-first book research and management.

#### 🧠 AI Features

- **Deterministic Metadata Extraction:** Automatically extract Title, Author, and Publication Year from EPUB (OPF) and PDF (Header) metadata.
- **AI Content Synthesis:** Integrated local LLM (via `node-llama-cpp`) reads book excerpts to generate 5-8 descriptive tags and a concise summary.
- **Adaptive Taxonomy:** System groups AI-generated tags into high-level Categories (e.g., Fiction, Science-Fiction, Programming) for better library browsing.

#### 📚 Library Management

- **Universal Search:** Instant, scored search across titles, authors, tags, and summaries.
- **Smart Filtering:** Filter by publication year, author, or specific thematic tags.
- **Manual Overrides:** Full control to manually edit bibliographic fields. Edits are "locked" to prevent being overwritten by subsequent AI scans.
- **Utility Tools:** Includes a "Missing Book Cleaner" to prune entries for files that have been moved or deleted.

#### 📊 Visualization

- **Interactive Concept Graph:** A D3.js powered force-directed graph that visualizes your library as a network of thematic connections.
- **Semantic Clustering:** Books and concepts naturally cluster together based on shared tags.
- **Graph Interaction:** Drag, hide, and filter nodes to explore relationships. Features "Save Image" and "Copy to Clipboard" for research output.

#### 🖥️ Desktop Integration

- **Local-First Architecture:** No cloud dependencies or external trackers. Everything stays on your machine.
- **Embedded Database:** High-performance SQLite database with WAL mode for a split-second responsive UI.
- **Theming:** Seamless Light and Dark mode support with a modern, glassmorphic aesthetic.
- **Export System:** Bulk-export filtered subsets of your library to local folders for easy syncing with hardware e-readers.
- **Backup Reliability:** Safe staging mechanism and WAL checkpoints ensure backups are reliable and lock-free.
- **Developer Workflow:** Auto-incrementing build numbers and cleaned doc paths for easier contribution.

#### 🎨 UI Refinements

- **High Contrast:** Optimized utility icons for visibility in both light and dark modes.
- **Visual Feedback:** Enhanced toggle states and "Show in Folder" backup interactions.

---

### Versioning Policy

- **Major (X.0.0):** Significant shifts in architecture, scope, or breaking changes.
- **Minor (1.X.0):** New feature additions or substantial enhancements.
- **Patch (1.0.X):** Bug fixes, reliability improvements, and minor UI refinements.

[1.0.0]: https://github.com/pbeens/Vector-Bookshelf/releases/tag/v1.0.0
