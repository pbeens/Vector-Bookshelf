# Vector Bookshelf

A high-end research tool that treats a directory of books as a raw knowledge base, extracting its own metadata, relationship intelligence, and AI-derived classifications.

> [!IMPORTANT]
> **AI Architecture:** This project now runs exclusively on an **Embedded Local AI** (via `node-llama-cpp`). It requires no external servers (like LM Studio or Ollama) and is fully self-contained.
>
> *Note: This repository also includes development support files, such as custom `skills/` configurations, to assist with agentic development workflows.*

## 🛠 Tech Stack

- **Frontend:** React (Vite) + Tailwind CSS v4
- **Backend:** Node.js (Express)
- **Database:** SQLite (with WAL mode for robustness)
- **AI Integration:** Embedded `llama.cpp` (GGUF Models)
- **Core Libraries:** `node-llama-cpp` (Inference), `epub2` (EPUB parsing), `pdf-parse` (PDF analysis)

## 🚀 How It Works

The system operates in **Phases** to ensure performance and data integrity.

### The 3-Step Import Process

**1. Add Books (Scan Library)**

- Click "Scan Library" to identify files.
- Extracts basic metadata (Title, Author, Year) from file headers.
- **Result:** Books appear in the list but lack tags/summaries.

**2. AI Data Scan**

- Click "AI Data Scan" to process book content.
- Reads the first **5000 characters** (Preface/Intro) of each book.
- Processes text using the local GGUF model.
- **Result:** Books get rich tags (e.g., "Space-Opera", "Python") and summaries.

**3. Rescan Categories**

- Click "Rescan Categories" to organize your library.
- AI analyzes all your unique tags and groups them into high-level Categories.
- **Fiction/Non-Fiction** is automatically assigned as the first category based on specific genres.
- **Result:** Books are assigned up to 3 Categories (e.g., "Fiction, Science-Fiction, Space-Opera") for easy filtering.

## ✨ UI Features

- **Smart Search & Filtering:** Instantly search by Title, Author, or Tag. Filter by Publication Year. Results update in real-time.
- **Adaptive Categories:** The system "learns" from your tags to create high-level categories (e.g., "Fiction", "Science-Fiction", "History").
- **Manual Metadata Editing:** Hover over any Title/Author to see a ✎ pencil. Click to edit inline. Edits are **locked** and safe from auto-scans.
- **Bulk Export:** Filter your library (e.g., "Fiction" + "Neil Gaiman") and export the actual files to a folder of your choice.
- **Author Filtering:** Click any author name to filter the library. Combine multiple authors and tags for precise searches.
- **Light/Dark Mode:** Toggle seamlessly between a focused Dark Mode for night reading and a crisp Light Mode for high-contrast visibility.
- **Interactive Hover Summaries:** Hover over any title to see an AI-generated summary tooltip.
- **"Scan Now" Tooltip Action:** Process individual books instantly without a full library scan.
- **Clickable Filenames:** Click any filename in the library table to open its containing folder in Windows Explorer.
- **Error Reporting:** Built-in "Export Errors" tool generates a text file report of all corrupted or skipped books for easy cleanup.
- **Real-time Stats:** Live tracking of detected files, added books, metadata extraction, and failures.
- **Glassmorphism UI:** Modern, premium aesthetic with smooth transitions and stable layouts.
- **AI Context Indicator:** Live display of the active context size (e.g., "8192 active ctx") to monitor VRAM usage.
- **Scan Completion Indicators:** Visual feedback (Green/Emerald buttons) when scans finish, with click-to-clear interaction.

## 🧹 Maintenance Commands

The project includes built-in automation to help with testing, cleanup, and documentation:

- **`/restart-server`**: Stops all Node.js processes and restarts both the backend and frontend servers.
- **`/wipe-db`**: Stops all servers, deletes the database files, and restarts the backend/frontend stack from scratch.
- **`/update-docs`**: Updates `DEVELOPMENT_LOG.md` and `README.md` to reflect current project state and recent changes.

## 🔮 Future Roadmap

- **External Media Awareness:** Intelligent "Missing Book Cleaner" that recognizes books on disconnected USB drives or network shares by tracking volume labels/serial numbers to prevent accidental database purging.
- **Cloud/External LLM API Support:** Re-introduce support for OpenAI/Anthropic APIs as an optional fallback.
- **Visuals & Metadata:**
  - **Local Covers:** Auto-extract `cover.jpg` from Calibre/local folders.
  - **Google Books Integration:** Fallback API support for fetching missing covers and correcting metadata.
- **Queue System:**
  - **Non-Blocking Scans:** Queue up books or batches for AI processing while other operations continue.

## 📦 Project Setup

1. **Install Dependencies**

    ```bash
    npm install
    ```

2. **AI Engine Configuration**

    - Create a `models/` folder in the project root.
    - Place a `.gguf` model file there.
    - **Recommended Model:** `Llama-3.2-3B-Instruct-Q4_K_M.gguf`.
    - **Note:** The system will automatically detect the model. It attempts to load with **8192 context**, falling back to 4096 or 2048 if VRAM is insufficient.

3. **Start Development Environment**

    ```bash
    # Frontend (Vite)
    npm run dev

    # Backend (Express API)
    node src/server/index.js
    ```

4. **Access UI**
    Visit `http://localhost:5173/`

## 🐛 Feedback & Support

Found a bug? Have a feature idea?
Please create a new **Issue** in this repository. We welcome feedback to make Vector Bookshelf better!
