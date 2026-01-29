# Project: Vector Bookshelf

**Objective:** A high-end research tool that treats a directory of books as a raw knowledge base, extracting its own metadata and relationship intelligence.

## 🛠 Tech Stack

- **Environment:** Antigravity (Agentic Workflow)
- **Frontend:** React / Tailwind CSS
- **Visuals:** D3.js
- **Backend:** Node.js
- **Core Libraries:** `epub-meta` (or similar) for EPUBs, `pdf-parse` or `pdfx` for PDFs.

## 📋 Tagging Standards

- **Format:** `Pascal-Case-With-Hyphens` (e.g., `Machine-Learning`, `Roman-History`).
- **Logic:** Tags are derived from:
    1. Internal file metadata.
    2. AI-driven content analysis (scanning the first 10% of the book text).

## 🚀 Iterative Development Plan

### Phase 1: Directory Ingestion (Current)

- **Feature:** "Knowledge Base" Setup.
- **Requirement:** User inputs a local path. The system must scan the directory and identify all `.epub` and `.pdf` files.
- **UI:** A simple, clean landing page with a directory picker and a "Scan Library" button.

### Phase 2: Native Metadata Extraction

- **Feature:** Direct File Parsing.
- **Requirement:** Extract Author, Title, and Publication Year from the file headers (OPF for EPUB, Metadata for PDF).
- **Constraint:** DO NOT look for or use `metadata.db` or Calibre files.

### Phase 3: Content-Based Research & Tagging

- **Feature:** Deep Content Scanner.
- **Requirement:** Open each file, extract a text sample, and use AI to suggest 5-10 research tags.
- **Verification:** User interface to "Accept/Reject" suggested tags before they are finalized.

### Phase 4: Relationship Mapping

- **Feature:** D3.js "Concept Graph".
- **Requirement:** Map books to tags. Selecting a tag like `Quantum-Mechanics` highlights all books and reveals "Co-occurring" tags found within those specific texts.

## 🧪 System Instructions for Agent

1. **Agent Role:** You are a File-System Specialist. Your primary task is reading binary files (PDF/EPUB) and extracting text.
2. **Library Independence:** Act as if Calibre does not exist. Your source of truth is the file itself.
3. **Incrementalism:** Focus ONLY on Phase 1. Build the Node.js filesystem bridge first to list the files in the UI.
4. **Context:** Use the `@gemini.md` file to maintain the hyphenated tagging rule throughout the project.
