# Project Charter: Vector Bookshelf

> [!IMPORTANT]
> **STATUS NOTICE:** This document is internal guidance for AI-assisted development (Antigravity). It serves as a project charter and agent navigation aid. It is **not** user-facing documentation, a roadmap, or a definitive source of truth. In the event of any conflict, the **Source Code** and **README.md** always take precedence.

## 🖥️ Platform & Runtime

**Vector Bookshelf is an Electron-based desktop application.**

- **Desktop-Only:** The application is architected to run exclusively as an Electron desktop app.
- **Unsupported Runtimes:** Standalone web, browser-only, or remote server execution is **not supported**. The UI is built to interact directly with local filesystem APIs and Electron-specific IPC handlers.
- **Development Assumption:** All development and testing must assume a desktop environment where Electron APIs (e.g., `dialog`, `shell`, `app.getPath`) are available. Running the UI in a standard browser context is non-functional for core features (like scanning and library management).

## 🧭 Documentation Boundaries

To maintain a clean separation between user documentation and internal development material:

1. **README.md Integrity:** The `README.md` is the primary entry point for users. It must never reference:
   - `SRS.md`
   - Any documents under `docs/` (educational, historical, or draft material)
   - This file (`gemini.md`)
2. **Informational Docs:** Documents under `docs/` are strictly informational for contributors or educational purposes and are not required for regular users of the application.

## 🎯 Project Intent

Vector Bookshelf is a high-end research tool designed to treat a local directory of books as a raw knowledge base. It extracts its own intelligence from file content rather than relying on external databases or library managers.

### Core Objectives

- **Autonomous Intelligence:** Extract metadata and synthesize relationships directly from file content.
- **Research Utility:** Enable concept-based exploration via interactive visuals (D3.js).
- **Embedded Operation:** Run entirely locally without external server dependencies.

## 🎨 Design Principles

- **Local-First & Private:** All processing (parsing, AI inference) happens on the user's machine via the desktop environment.
- **Performance:** Utilize SQLite WAL mode and synchronous DB interactions for a snappy desktop experience.
- **Aesthetic Excellence:** Use vibrant colors, glassmorphism, and smooth animations to create a premium, "wow" factor UI.
- **Data Integrity:** Protect manual user edits via field-locking mechanisms.

## 🏗️ Architectural Direction

The system follows a Desktop Client-Server model (Electron/Express) with a phase-based processing pipeline:

1. **Phase 1: Deterministic Extraction:** Identify files and extract basic bibliographic fields (Title, Author, Year) from file headers using standard libraries.
2. **Phase 2: AI-Driven Synthesis:** Use an embedded local LLM to generate descriptive tags and summaries based on content analysis (text excerpts).
3. **Phase 3: Adaptive Taxonomy:** Group AI-generated tags into high-level categories through iterative analysis.

## 📂 Data Storage & Persistence

To ensure user data remains accessible across updates and environments:

- **Development Environment:** The application must use `Vector Bookshelf Dev` as its name. This isolates development data from production data.
- **Production Environment:** The application must use `Vector Bookshelf` as its name.
- **Folder Stability:** The application name (and thus the `userData` directory) must **never** include version numbers (e.g., `v1.0.0`). Semantic versions should be displayed in the UI/title bar, but the underlying data folder must remain stable to prevent data loss or "missing library" issues following an upgrade.

## 🤖 Agent Interaction Rules

### Tagging Standards

- **Format:** `Pascal-Case-With-Hyphens` (e.g., `Machine-Learning`, `Roman-History`).
- **Standardized Case:** Use the hyphenated rule consistently across all prompts and UI displays.

### Development Philosophy

- **Verification First:** Cross-reference documentation claims with actual code implementation (e.g., check `metadata.js` before asserting extraction logic).
- **Incrementalism:** Build and verify features piece-by-piece, ensuring each phase is robust before moving to the next.
- **No Speculation:** If implementation details are not yet verified or built, leave descriptions abstract rather than assuming specific mechanisms.

## 🔢 Development Build Identification (Required)

During **development builds**, the application must clearly identify itself as a non-release build.

Guidance:

- Development builds must include a **monotonically increasing build identifier**.
- This identifier must be:
  - incremented automatically on each development build or dev run,
  - displayed prominently in the **window title bar**.
- The purpose is to allow the developer to immediately verify:
  - which build is currently running,
  - whether a rebuild actually occurred,
  - and to avoid confusion between cached, unpacked, and packaged runs.

Constraints:

- This requirement applies **only to development builds**.
- Release builds (for example v1.0.0) **must display the semantic version, build date, and build time** (e.g. "Vector Bookshelf v1.0.0 (2025-02-04 14:30:05)") in the title bar.
- The exact mechanism (timestamp-based, counter-based, hash-based) is an implementation detail and may vary, but the value must be human-readable and clearly different between builds.

Agent instruction:

- If a development build is running and the build identifier has not changed since the previous run, treat this as a defect in the development workflow and correct it before proceeding with further work.

## 🤝 Technical Implementation Protocol

If the **USER** recommends a technical fix (e.g., recommended by another AI or another external source), the following applies:

### Agreement required before implementation

Before making any changes, please:

- Review the proposed plan.
- Confirm explicitly whether you (the user) agree that this is the correct and safest approach.

If you, the AI, disagree or see risks, explain why and propose an alternative.

The AI must **not** implement anything until the user has confirmed agreement.
