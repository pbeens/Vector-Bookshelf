# Software Requirements Specification (SRS)

**Project Name:** Vector Bookshelf
**Version:** 0.8.0
**Date:** 2026-02-02

---

## 1. Introduction

### 1.1 Purpose

The purpose of this document is to define the functional and non-functional requirements for **Vector Bookshelf**, a local-first research tool designed to transform flat file directories of e-books into an intelligent, queryable knowledge base using embedded AI.

### 1.2 Scope

Vector Bookshelf is a standalone desktop application. It scans local directories for EPUB and PDF files, extracts metadata, uses a local Large Language Model (LLM) to generate semantic tags and summaries, and visualizes relationships via an interactive force-directed graph. It operates entirely offline to ensure data privacy and zero API costs.

### 1.3 Definitions & Acronyms

- **LLM**: Large Language Model (specifically GGUF format via `node-llama-cpp`).
- **GGUF**: GPT-Generated Unified Format, a binary format for fast loading of LLMs.
- **SRS**: Software Requirements Specification.
- **WAL**: Write-Ahead Logging (SQLite journaling mode).
- **Taxonomy**: The hierarchical classification system (Category -> Tag -> Book).

---

## 2. Overall Description

### 2.1 Product Perspective

- **Type**: Desktop Application (Electron).
- **Architecture**: Monorepo with dedicated components:
  - **apps/desktop**: Electron main process and orchestration.
  - **apps/api**: Node.js (Express) backend server for data processing.
  - **apps/web**: React frontend for user interaction.
- **Database**: SQLite (local instance).
- **Dependency**: Self-contained; relies on embedded `llama.cpp` for inference. No external internet connection required.

### 2.2 User Characteristics

- **Target Audience**: Researchers, Archivists, Data Hoarders, Students.
- **Technical Proficiency**: Moderate. Users comfortable with file systems and basic terminal commands, though the UI is designed for non-technical usage.

### 2.3 Assumptions and Dependencies

- User has a semi-modern CPU (AVX2 support) or NVIDIA GPU for AI acceleration.
- User files are standard EPUB or PDF formats.
- Node.js runtime environment is available.

---

## 3. Functional Requirements

### 3.1 Library Management

- **FR-01 Local File Scanning**: The system must scan a user-provided directory path recursively to identify `.epub` and `.pdf` files.
- **FR-02 Metadata Extraction**: The system must extract standard metadata (Title, Author, Publication Year) from file headers during the initial scan.
- **FR-03 Missing Book Detection**: A utility must exist to identify and purge database entries for files that no longer exist on the disk ("Ghost Books").

### 3.2 AI Analysis & Enrichment

- **FR-04 Content Sampling**: The system must read the first 5,000 characters of text from each book (Preface/Introduction) for analysis.
- **FR-05 Local Inference**: The system must use an embedded GGUF model to analyze the text sample.
- **FR-06 Tag Generation**: The system must generate 3-5 semantic tags (e.g., "Space Opera", "Cybersecurity") and a concise summary for each book.
- **FR-07 Taxonomy Generation**: The system must analyze the set of unique tags to generate high-level "Categories" (e.g., Tag: "Python" -> Category: "Programming").
- **FR-08 Context Awareness**: The system must auto-detect available VRAM and downgrade context size (8192 -> 4096 -> 2048) to prevent crashes.

### 3.3 User Interface (Search & Visualization)

- **FR-09 Virtualized List View**: The UI must render libraries of up to 50,000 books with <16ms frame times using windowing/virtualization.
- **FR-10 Real-Time Search**: Users must be able to search by Title, Author, or Tag with instant debounce filtering using SQL `LIKE` queries.
- **FR-11 Interactive Graph View**:
  - Visualize books, tags, and categories as nodes in a force-directed graph.
  - Support physics interactions (drag to move, auto-center).
  - Provide context menus for saving/copying view snapshots.
  - Auto-optimize layout on startup to fit the container.
- **FR-12 Dark/Light Mode**: The interface must support persistent theming with high-contrast distinct color palettes.

### 3.4 Data Management & Export

- **FR-13 Bulk Export**: Users must be able to export the actual files of a filtered selection (e.g., "All Sci-Fi books from 1990") to a specific folder.
- **FR-14 Error Reporting**: The system must allow exporting a log of files that failed scanning or metadata extraction.
- **FR-15 Manual Editing**: Users must be able to manually correct Title, Author, and Year fields, with locks to prevent AI overwrites.

---

## 4. Non-Functional Requirements

### 4.1 Performance

- **NFR-01 Scalability**: The system must support libraries of at least 32,000 items without UI lag.
- **NFR-02 Scan Speed**: Basic metadata scanning should process >100 files/second. AI scanning speed depends on hardware but should average >5 seconds/book on CPU.
- **NFR-03 Startup Time**: The application server should reach "Ready" state in under 5 seconds.

### 4.2 Reliability & Integrity

- **NFR-04 Data Integrity**: SQLite must operate in WAL mode to prevent locking issues during concurrent AI writes and UI reads.
- **NFR-05 Crash Resilience**: Long-running scans must persist state to disk; if the app crashes, it should be able to resume or report the interruption.

### 4.3 Privacy & Security

- **NFR-06 Local-Only**: No telemetry, analytics, or file data shall be sent to external servers. All processing is local.
- **NFR-07 Sandboxing**: The browser UI must not have direct filesystem write access; all file operations must be mediated by the API.

---

## 5. Technical Stack Constraints

- **Runtime**: Node.js (Latest LTS).
- **Frontend Framework**: React 19+ (Vite).
- **Styling**: Tailwind CSS v4.
- **Database**: SQLite3 via `better-sqlite3`.

---

## 6. Future Scope (Roadmap)

- Support for `.mobi` and `.azw3` formats.
- External API integration (OpenAI/Anthropic) as an optional "Cloud Turbo" mode.
- Cover art extraction and grid view.
